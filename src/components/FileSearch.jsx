const handleSearch = async (e) => {
  e.preventDefault();
  
  if (!accessionNumber.trim()) {
    setError('Please enter an accession number');
    return;
  }
  
  setLoading(true);
  setError(null);
  setResults(null);
  
  try {
    const response = await fetch(`/api/search?accessionNumber=${encodeURIComponent(accessionNumber.trim())}`);
    
    // Get the response text first
    const text = await response.text();
    console.log('Response status:', response.status);
    console.log('Response text:', text);
    
    // Try to parse as JSON
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      throw new Error(`Invalid response from server: ${text.substring(0, 100)}`);
    }
    
    if (!response.ok) {
      throw new Error(data.error || 'Search failed');
    }
    
    setResults(data);
  } catch (err) {
    console.error('Search error:', err);
    setError(err.message);
  } finally {
    setLoading(false);
  }
};