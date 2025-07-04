import React, { useState, useEffect, useMemo, lazy, Suspense, useCallback, useRef } from 'react';
import './App.css';
import LoadingState from './components/LoadingState';
import Navigation from './components/Navigation';
import Sidebar from './components/Sidebar';
// Lazy load ProductCard
const ProductCard = lazy(() => import('./components/ProductCard'));

// Mock data for development and fallback
const mockData = [
  {
    "Item Name": "Dumbbell Set",
    "Brand": "PowerBlock",
    "Category": "Strength",
    "Cost": "299.99",
    "Exos Part Number": "DB-001",
    "Preferred": "Yes"
  },
  {
    "Item Name": "Resistance Bands",
    "Brand": "TheraBand",
    "Category": "Mobility",
    "Cost": "49.99",
    "Exos Part Number": "RB-002",
    "Preferred": "Yes"
  },
  {
    "Item Name": "Foam Roller",
    "Brand": "TriggerPoint",
    "Category": "Recovery",
    "Cost": "34.99",
    "Exos Part Number": "FR-003",
    "Preferred": "No"
  }
];

const GYM_ITEMS_API_URL = 'https://sheetdb.io/api/v1/uwc1t04gagpfq';
const GYM_ITEMS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyPDJRGyVH0H9LCRBS4uMowMPE59KphrQf7g16RpbkrztR36OKGmSKMCpdA8uTAD62C/exec';
const SHEETDB_TAB_NAME = 'Gym Items List';
const CATALOG_API_URL = 'https://script.google.com/macros/s/AKfycbyPDJRGyVH0H9LCRBS4uMowMPE59KphrQf7g16RpbkrztR36OKGmSKMCpdA8uTAD62C/exec';

const LOCAL_STORAGE_KEY = 'cachedProducts';

function App() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copySuccess, setCopySuccess] = useState(null);
  
  // Filter states
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [showAllItems, setShowAllItems] = useState(false);

  // Gym states
  const [activeGym, setActiveGym] = useState('MP2');
  const [gymItems, setGymItems] = useState({
    MP2: [],
    MAT3: [],
    MP5: []
  });

  // Status states
  const [itemStatuses, setItemStatuses] = useState({});
  const [statusNotes, setStatusNotes] = useState({});

  const gyms = ['MP2', 'MAT3', 'MP5'];

  // Infinite scroll states
  const [visibleProducts, setVisibleProducts] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const ITEMS_PER_LOAD = 12;
  const observerRef = useRef();
  const loadingRef = useRef();

  const [initialPreferredOnly, setInitialPreferredOnly] = useState(true);

  // Fetch equipment list from Apps Script endpoint with LocalStorage caching
  useEffect(() => {
    // Try to load from localStorage first
    const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setProducts(parsed);
        setLoading(false);
      } catch {}
    }
    // Always fetch fresh data in the background
    const fetchCatalog = async () => {
      try {
        const response = await fetch(CATALOG_API_URL);
        if (!response.ok) throw new Error('Failed to fetch catalog');
        const data = await response.json();
        const normalized = data.map(item => ({
          "Item Name": item["item name"] || "",
          "Brand": item["brand"] || "",
          "Category": item["category"] || "",
          "Cost": item["cost"] !== undefined ? String(item["cost"]) : "",
          "Exos Part Number": item["exos part number"] || "",
          "Preferred": item["preferred"] || "",
          "URL": item["url"] || ""
        }));
        setProducts(normalized);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalized));
      } catch (err) {
        // If fetch fails and no cached data, use mock data as fallback
        if (!localStorage.getItem(LOCAL_STORAGE_KEY)) {
          console.warn('Failed to fetch from Google Sheet, using mock data as fallback');
          setProducts(mockData);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mockData));
        }
      } finally {
        setLoading(false);
      }
    };
    fetchCatalog();
  }, []);

  // Load existing gym items from SheetDB
  useEffect(() => {
    const loadGymItems = async () => {
      try {
        const response = await fetch(`${GYM_ITEMS_API_URL}?sheet=${encodeURIComponent(SHEETDB_TAB_NAME)}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Loaded data from SheetDB:', data);
        
        if (!Array.isArray(data) || data.length === 0) {
          console.log('No data found in sheet');
          return;
        }
        
        // Filter out empty sheet indicators
        const validItems = data.filter(item => 
          item["Item Name"] && 
          item["Item Name"] !== "EMPTY_SHEET"
        );
        
        if (validItems.length === 0) {
          console.log('No valid items found');
          return;
        }
        
        console.log('Loading', validItems.length, 'items from sheet');
        
        // Convert to our local state format
        const newGymItems = {};
        
        validItems.forEach(item => {
          const gym = item.Gym || 'Unknown Gym';
          const quantity = parseInt(item.Quantity) || 1;
          
          if (!newGymItems[gym]) {
            newGymItems[gym] = [];
          }
          
          newGymItems[gym].push({
            "Item Name": item["Item Name"] || "Unknown Item",
            "Brand": item.Brand || "Unknown Brand",
            "Category": item.Category || "General",
            "Cost": item.Cost || "",
            "Exos Part Number": item["Exos Part Number"] || "",
            "URL": item.URL || "",
            "quantity": quantity,
            "status": item.Status || "Pending Approval",
            "note": item.Note || ""
          });
        });
        
        setGymItems(newGymItems);
        console.log('Loaded gym items:', newGymItems);
      } catch (err) {
        console.error('Failed to load gym items:', err);
      }
    };
    
    loadGymItems();
  }, []);

  // Get unique categories and brands
  const { categories, brands } = useMemo(() => {
    const uniqueCategories = [...new Set(products.map(product => product.Category).filter(Boolean))];
    const uniqueBrands = [...new Set(products.map(product => product.Brand).filter(Boolean))];
    return {
      categories: uniqueCategories.sort(),
      brands: uniqueBrands.sort()
    };
  }, [products]);

  // Filter products
  const filteredProducts = useMemo(() => {
    let base = products;
    // On initial load, only show preferred products unless filters/search are used
    if (initialPreferredOnly && !searchTerm && !selectedCategory && !selectedBrand && !showAllItems) {
      base = products.filter(product => product.Preferred?.toLowerCase() === 'yes');
    }
    return base.filter(product => {
      const matchesSearch = searchTerm === '' || 
        product["Item Name"]?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.Brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.Category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product["Exos Part Number"]?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesBrand = selectedBrand === '' || product.Brand === selectedBrand;
      const isPreferred = product.Preferred?.toLowerCase() === 'yes';
      if (selectedCategory === 'preferred') {
        return matchesSearch && matchesBrand && isPreferred;
      }
      const matchesCategory = selectedCategory === '' || product.Category === selectedCategory;
      const shouldShow = showAllItems || searchTerm !== '' || selectedCategory !== '' || selectedBrand !== '';
      return matchesSearch && matchesCategory && matchesBrand && (shouldShow || isPreferred);
    });
  }, [products, searchTerm, selectedCategory, selectedBrand, showAllItems, initialPreferredOnly]);

  // Reset visible products when filters change
  useEffect(() => {
    setVisibleProducts(filteredProducts.slice(0, ITEMS_PER_LOAD));
    setHasMore(filteredProducts.length > ITEMS_PER_LOAD);
  }, [filteredProducts]);

  // Load more products for infinite scroll
  const loadMoreProducts = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);
    
    setTimeout(() => {
      const currentLength = visibleProducts.length;
      const nextBatch = filteredProducts.slice(currentLength, currentLength + ITEMS_PER_LOAD);
      
      setVisibleProducts(prev => [...prev, ...nextBatch]);
      setHasMore(currentLength + ITEMS_PER_LOAD < filteredProducts.length);
      setIsLoadingMore(false);
    }, 500); // Simulate loading delay
  }, [visibleProducts.length, filteredProducts, isLoadingMore, hasMore]);

  // Infinite scroll intersection observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMoreProducts();
        }
      },
      { threshold: 0.1 }
    );
    
    observerRef.current = observer;
    
    if (loadingRef.current) {
      observer.observe(loadingRef.current);
    }
    
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMoreProducts]);

  // Scroll to top functionality
  const scrollToTop = () => {
    console.log('scrollToTop function called'); // Debug log
    console.log('Current scroll position:', window.scrollY); // Debug current position
    
    // Find the content-area element and scroll it
    const contentArea = document.querySelector('.content-area');
    if (contentArea) {
      console.log('Found content-area, scrolling it to top');
      contentArea.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      console.log('Content-area not found, trying window scroll');
      // Fallback to window scroll
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
    
    console.log('Scroll attempted, new position:', window.scrollY); // Debug new position
  };

  // Show/hide back to top button
  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 300);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // When user interacts with filters/search, show all products
  useEffect(() => {
    if (searchTerm || selectedCategory || selectedBrand || showAllItems) {
      setInitialPreferredOnly(false);
    }
  }, [searchTerm, selectedCategory, selectedBrand, showAllItems]);

  // Handlers with useCallback
  const copyProductInfo = useCallback((product) => {
    const productInfo = [
      product["Item Name"] || '',
      product.Brand || '',
      product.Category || '',
      product.Cost ? `$${product.Cost}` : '',
      product["Exos Part Number"] || '',
      product.URL || ''
    ].join('\t');
    navigator.clipboard.writeText(productInfo).then(() => {
      setCopySuccess(product["Item Name"]);
      setTimeout(() => setCopySuccess(null), 2000);
    }).catch(() => {});
  }, []);

  const handleAddToGym = useCallback(async (product, gym, quantity, status) => {
    const currentStatus = status || itemStatuses[product["Item Name"]] || 'Pending Approval';
    const newItem = { ...product, quantity, status: currentStatus, Gym: gym };
    
    // Check if this item already exists in the gym
    setGymItems(prev => {
      const existingItems = prev[gym] || [];
      const existingIndex = existingItems.findIndex(item => 
        item["Item Name"] === product["Item Name"] && 
        item["Exos Part Number"] === product["Exos Part Number"]
      );
      
      if (existingIndex !== -1) {
        // Update existing item quantity
        const updatedItems = [...existingItems];
        updatedItems[existingIndex] = {
          ...updatedItems[existingIndex],
          quantity: updatedItems[existingIndex].quantity + quantity
        };
        return { ...prev, [gym]: updatedItems };
      } else {
        // Add new item
        return { ...prev, [gym]: [...existingItems, newItem] };
      }
    });
    
    // Reset the status for this item after adding to gym
    setItemStatuses(prev => {
      const newStatuses = { ...prev };
      delete newStatuses[product["Item Name"]];
      return newStatuses;
    });
    setStatusNotes(prev => {
      const newNotes = { ...prev };
      delete newNotes[product["Item Name"]];
      return newNotes;
    });
    
    // No automatic save to SheetDB - user will click Save button when ready
    console.log('Item added to gym (local only - click Save to sync to sheet)');
  }, [itemStatuses]);

  const handleRemoveFromGym = useCallback((gym, index) => {
    setGymItems(prev => {
      return {
        ...prev,
        [gym]: prev[gym].filter((_, i) => i !== index)
      };
    });
  }, []);

  const handleStatusChange = useCallback((itemName, status) => {
    setItemStatuses(prev => ({ ...prev, [itemName]: status }));
    // Clear any existing note for this item if status is not "Not Approved"
    if (status !== 'Not Approved') {
      setStatusNotes(prev => {
        const newNotes = { ...prev };
        delete newNotes[itemName];
        return newNotes;
      });
    }
  }, []);

  const handleNoteSubmit = useCallback((itemName, note) => {
    setItemStatuses(prev => ({ ...prev, [itemName]: 'Not Approved' }));
    setStatusNotes(prev => ({ ...prev, [itemName]: note }));
  }, []);

  const handleSearch = (term) => {
    setSearchTerm(term);
    if (term !== '') {
      setShowAllItems(true);
    }
  };

  const handleCategorySelect = (category) => {
    setSelectedCategory(category);
    // Only set showAllItems to true if not selecting 'preferred'
    if (category !== 'preferred') {
      setShowAllItems(true);
    } else {
      setShowAllItems(false);
    }
    // Collapse sidebar when category is selected
    setIsSidebarExpanded(false);
  };

  const handleBrandSelect = (brand) => {
    setSelectedBrand(brand);
    setShowAllItems(true);
    // Collapse sidebar when brand is selected
    setIsSidebarExpanded(false);
  };

  const handleContentClick = (e) => {
    // Collapse sidebar when clicking in dead space (not on sidebar, navigation, or product cards)
    if (isSidebarExpanded && 
        !e.target.closest('.sidebar') && 
        !e.target.closest('.main-nav') && 
        !e.target.closest('.product-card')) {
      setIsSidebarExpanded(false);
    }
  };

  const handleReset = (e) => {
    if (e) {
      e.preventDefault();
    }
    setSearchTerm('');
    setSelectedCategory('');
    setSelectedBrand('');
    setShowAllItems(false);
    // Reset the URL to the base path for GitHub Pages subdirectory
    window.location.pathname = '/my-react-app/';
  };

  const handleGymClick = (gym) => {
    setActiveGym(gym);
  };

  const handleQtyChange = async (gym, index, newQty) => {
    if (newQty < 0) return;
    
    // Update quantity in local state (including 0)
    setGymItems(prev => {
      const items = [...prev[gym]];
      items[index] = { ...items[index], quantity: newQty };
      return { ...prev, [gym]: items };
    });
    
    // Quantity updated locally - will be synced to sheet when Save is clicked
    console.log('Quantity updated locally - click Save to sync to sheet');
  };

  const handleGymStatusChange = async (itemName, status) => {
    // Find the item in gymItems and update its status
    const updatedGymItems = { ...gymItems };
    let updatedItem = null;
    
    for (const gym of gyms) {
      const itemIndex = updatedGymItems[gym]?.findIndex(item => item["Item Name"] === itemName);
      if (itemIndex !== -1) {
        updatedGymItems[gym][itemIndex] = { ...updatedGymItems[gym][itemIndex], status };
        updatedItem = updatedGymItems[gym][itemIndex];
        break;
      }
    }
    
    if (updatedItem) {
      setGymItems(updatedGymItems);
      
      // Status updated locally - will be synced to sheet when Save is clicked
      console.log('Status updated locally - click Save to sync to sheet');
    }
  };

  const handleGymNoteSubmit = async (itemName, note) => {
    // Find the item in gymItems and update its status and note
    const updatedGymItems = { ...gymItems };
    let updatedItem = null;
    
    for (const gym of gyms) {
      const itemIndex = updatedGymItems[gym]?.findIndex(item => item["Item Name"] === itemName);
      if (itemIndex !== -1) {
        updatedGymItems[gym][itemIndex] = { 
          ...updatedGymItems[gym][itemIndex], 
          status: 'Not Approved',
          note 
        };
        updatedItem = updatedGymItems[gym][itemIndex];
        break;
      }
    }
    
    if (updatedItem) {
      setGymItems(updatedGymItems);
      
      // Note updated locally - will be synced to sheet when Save is clicked
      console.log('Note updated locally - click Save to sync to sheet');
    }
  };

  const saveGymItems = async () => {
    try {
      console.log('Starting two-step save process...');

      // STEP 1: Pull existing data from sheet
      console.log('Step 1: Pulling existing data...');
      const existingDataResponse = await fetch(`${GYM_ITEMS_API_URL}?sheet=${encodeURIComponent(SHEETDB_TAB_NAME)}`);
      if (!existingDataResponse.ok) {
        throw new Error(`Failed to fetch existing data: ${existingDataResponse.status}`);
      }
      
      const existingData = await existingDataResponse.json();
      console.log('Found', existingData.length, 'existing rows in sheet');

      // STEP 2: Delete all existing rows using correct SheetDB syntax
      console.log('Step 2: Deleting existing rows...');
      let deletedCount = 0;
      for (const row of existingData) {
        try {
          console.log('Attempting to delete row:', row["Item Name"]);
          
          // SheetDB DELETE requires query parameters: column and value
          const deleteUrl = `${GYM_ITEMS_API_URL}?sheet=${encodeURIComponent(SHEETDB_TAB_NAME)}&column=Item%20Name&value=${encodeURIComponent(row["Item Name"])}`;
          console.log('Delete URL:', deleteUrl);
          
          const deleteResponse = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
          });
          
          console.log('Delete response status:', deleteResponse.status);
          
          if (deleteResponse.ok) {
            deletedCount++;
            console.log('Successfully deleted row:', row["Item Name"]);
          } else {
            console.warn('Failed to delete row:', row["Item Name"], 'Status:', deleteResponse.status);
            const errorText = await deleteResponse.text();
            console.warn('Delete error response:', errorText);
          }
        } catch (deleteErr) {
          console.warn('Error deleting row:', row["Item Name"], deleteErr);
        }
      }
      
      console.log('Successfully deleted', deletedCount, 'out of', existingData.length, 'rows');

      // STEP 3: Prepare new data (excluding 0 quantity items)
      console.log('Step 3: Preparing new data...');
      console.log('Current gymItems state:', gymItems);
      
      const allItems = [];
      Object.entries(gymItems).forEach(([gym, items]) => {
        console.log(`Processing gym ${gym} with ${items.length} items`);
        
        // Group identical items by combining quantities
        const groupedItems = {};
        
        items.forEach(item => {
          console.log(`Processing item: ${item["Item Name"]} with quantity: ${item.quantity}`);
          
          // Skip items with 0 quantity - they will be effectively deleted
          if (item.quantity <= 0) {
            console.log(`Skipping item with 0 quantity: ${item["Item Name"]}`);
            return;
          }
          
          const key = `${item["Item Name"]}-${item["Exos Part Number"]}-${gym}`;
          
          if (groupedItems[key]) {
            // Add quantities for identical items
            groupedItems[key].quantity += item.quantity;
            console.log(`Combined quantities for ${item["Item Name"]}: ${groupedItems[key].quantity}`);
            // Use the most recent status if there are conflicts
            if (item.status && item.status !== 'Pending Approval') {
              groupedItems[key].status = item.status;
            }
            // Combine notes if both have them
            if (item.note && groupedItems[key].note) {
              groupedItems[key].note = `${groupedItems[key].note}; ${item.note}`;
            } else if (item.note) {
              groupedItems[key].note = item.note;
            }
          } else {
            // First occurrence of this item
            groupedItems[key] = {
              "Item Name": item["Item Name"],
              "Brand": item.Brand || "Unknown Brand",
              "Category": item.Category || "General",
              "Cost": item.Cost || "",
              "Exos Part Number": item["Exos Part Number"] || "",
              "URL": item.URL || "",
              "Gym": gym,
              "quantity": item.quantity,
              "status": item.status,
              "note": item.note || ""
            };
            console.log(`Added new item: ${item["Item Name"]} with quantity: ${item.quantity}`);
          }
        });
        
        // Add grouped items to the list
        Object.values(groupedItems).forEach(item => {
          allItems.push({
            "Item Name": item["Item Name"],
            "Brand": item.Brand,
            "Category": item.Category,
            "Cost": item.Cost,
            "Exos Part Number": item["Exos Part Number"],
            "URL": item.URL,
            "Gym": item.Gym,
            "Quantity": item.quantity,
            "Status": item.status,
            "Note": item.note
          });
        });
      });

      console.log('Prepared', allItems.length, 'items to save');
      console.log('Items to save:', allItems);

      // STEP 4: Add new data (or empty indicator if no items)
      console.log('Step 4: Adding new data...');
      if (allItems.length === 0) {
        console.log('No items to save - adding empty indicator');
        const emptyResponse = await fetch(`${GYM_ITEMS_API_URL}?sheet=${encodeURIComponent(SHEETDB_TAB_NAME)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            data: [{
              "Item Name": "EMPTY_SHEET",
              "Brand": "",
              "Category": "",
              "Cost": "",
              "Exos Part Number": "",
              "URL": "",
              "Gym": "",
              "Quantity": "",
              "Status": "",
              "Note": ""
            }]
          })
        });
        
        if (emptyResponse.ok) {
          console.log('Empty sheet indicator added');
          // Clear local state since sheet is now empty
          setGymItems({});
          console.log('Cleared local state - sheet is now empty');
          showFireCursor();
          return;
        }
      }

      const response = await fetch(`${GYM_ITEMS_API_URL}?sheet=${encodeURIComponent(SHEETDB_TAB_NAME)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: allItems })
      });

      if (!response.ok) {
        throw new Error(`Failed to add new data: ${response.status}`);
      }

      const result = await response.json();
      console.log('Successfully added', allItems.length, 'new items');
      
      // Remove 0 quantity items from local state after successful save
      setGymItems(prev => {
        console.log('Before cleanup - current state:', prev);
        const cleanedGymItems = {};
        Object.entries(prev).forEach(([gym, items]) => {
          console.log(`Processing gym ${gym} with ${items.length} items`);
          const nonZeroItems = items.filter(item => item.quantity > 0);
          console.log(`Found ${nonZeroItems.length} non-zero items in ${gym}`);
          if (nonZeroItems.length > 0) {
            cleanedGymItems[gym] = nonZeroItems;
          }
        });
        console.log('After cleanup - new state:', cleanedGymItems);
        return cleanedGymItems;
      });
      
      // Show fire emoji cursor effect
      showFireCursor();
      
      console.log('Two-step save completed successfully!');
    } catch (err) {
      console.error('Failed to save gym items:', err);
      alert('Failed to save gym items. Please try again.');
    }
  };

  // Fire emoji cursor effect for save success
  const showFireCursor = () => {
    const fireEmoji = document.createElement('div');
    fireEmoji.textContent = '🔥 SAVED! 🔥';
    fireEmoji.style.cssText = `
      position: fixed;
      pointer-events: none;
      font-size: 18px;
      font-weight: bold;
      color: #ff6b35;
      background: rgba(255, 255, 255, 0.95);
      padding: 8px 16px;
      border-radius: 20px;
      border: 2px solid #ff6b35;
      box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);
      z-index: 10000;
      transition: all 0.3s ease;
      transform: translate(-50%, -50%);
      animation: firePop 0.5s ease-out;
    `;
    
    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes firePop {
        0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
        50% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    
    // Random position (but keep it visible)
    const maxX = window.innerWidth - 200;
    const maxY = window.innerHeight - 100;
    const x = Math.max(100, Math.random() * maxX);
    const y = Math.max(100, Math.random() * maxY);
    
    fireEmoji.style.left = x + 'px';
    fireEmoji.style.top = y + 'px';
    
    document.body.appendChild(fireEmoji);
    
    setTimeout(() => {
      fireEmoji.remove();
      style.remove();
    }, 2000);
  };

  if (loading) return <LoadingState type="category" message="Loading products..." />;
  if (!products?.length && !loading) return <div className="no-products">No products found</div>;

  return (
    <div className="App">
      <Navigation 
        onSidebarToggle={() => setIsSidebarExpanded(!isSidebarExpanded)}
        onReset={handleReset}
      />
      <div className="main-content" onClick={handleContentClick}>
        <Sidebar
          categories={categories}
          brands={brands}
          selectedCategory={selectedCategory}
          selectedBrand={selectedBrand}
          searchTerm={searchTerm}
          onCategoryChange={handleCategorySelect}
          onBrandChange={handleBrandSelect}
          onSearchChange={handleSearch}
          isExpanded={isSidebarExpanded}
          onToggle={() => setIsSidebarExpanded(!isSidebarExpanded)}
          // Gym-related props
          activeGym={activeGym}
          gyms={gyms}
          gymItems={gymItems}
          handleGymClick={handleGymClick}
          handleRemoveFromGym={handleRemoveFromGym}
          onQtyChange={handleQtyChange}
          onStatusChange={handleGymStatusChange}
          onNoteSubmit={handleGymNoteSubmit}
          saveGymItems={saveGymItems}
        />
        <div className={`content-area ${isSidebarExpanded ? 'sidebar-expanded' : ''}`}>
          <div className="products-container">
            <Suspense fallback={<LoadingState type="products" />}>
              {visibleProducts.map((product, index) => (
                <ProductCard
                  key={`${product["Exos Part Number"]}-${index}`}
                  product={product}
                  onCopyInfo={copyProductInfo}
                  copySuccess={copySuccess}
                  onAddToGym={handleAddToGym}
                  itemStatuses={itemStatuses}
                  onStatusChange={handleStatusChange}
                  statusNotes={statusNotes}
                  onNoteSubmit={handleNoteSubmit}
                />
              ))}
            </Suspense>
            
            {/* Infinite scroll loading indicator */}
            {hasMore && (
              <div ref={loadingRef} className="infinite-scroll-loader">
                {isLoadingMore ? (
                  <div className="loading-spinner-container">
                    <div className="custom-loading-spinner">🏋️</div>
                    <p>Loading more equipment...</p>
                  </div>
                ) : (
                  <div className="scroll-hint">
                    <p>Scroll for more equipment</p>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* End of results - moved outside products-container */}
          <div 
            className="end-of-results"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('Mouse down - starting scroll'); // Debug log
              
              // Add visual feedback
              const element = e.currentTarget;
              element.style.transform = 'scale(0.9)';
              element.style.backgroundColor = '#ff0000';
              
              // Start scrolling
              const contentArea = document.querySelector('.content-area');
              if (contentArea) {
                const scrollInterval = setInterval(() => {
                  contentArea.scrollBy(0, -35); // Scroll up by 35px each interval (faster)
                }, 16); // ~60fps
                
                // Store the interval ID on the element so we can clear it on mouse up
                element.scrollInterval = scrollInterval;
              }
            }}
            onMouseUp={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('Mouse up - stopping scroll'); // Debug log
              
              // Remove visual feedback
              const element = e.currentTarget;
              element.style.transform = '';
              element.style.backgroundColor = '';
              
              // Stop scrolling
              if (element.scrollInterval) {
                clearInterval(element.scrollInterval);
                element.scrollInterval = null;
              }
            }}
            onMouseLeave={(e) => {
              // Also stop scrolling if mouse leaves the button
              const element = e.currentTarget;
              element.style.transform = '';
              element.style.backgroundColor = '';
              
              if (element.scrollInterval) {
                clearInterval(element.scrollInterval);
                element.scrollInterval = null;
              }
            }}
          >
            ▲
          </div>
          
          {/* Back to Top Button */}
          {showBackToTop && (
            <button 
              onClick={scrollToTop} 
              className="back-to-top-button"
              aria-label="Back to top"
            >
              ↑
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;