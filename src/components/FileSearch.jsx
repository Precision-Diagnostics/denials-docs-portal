import { useState } from 'react';
import './FileSearch.css';

function FileSearch() {
  const [accessionNumber, setAccessionNumber] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
      
      const text = await response.text();
      console.log('Response status:', response.status);
      console.log('Response text:', text);
      
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

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="file-search-container">
      <div className="search-header">
        <h1>Denials Documentation Portal</h1>
        <p>Search for documents by accession number</p>
      </div>

      <form onSubmit={handleSearch} className="search-form">
        <div className="search-input-group">
          <input
            type="text"
            value={accessionNumber}
            onChange={(e) => setAccessionNumber(e.target.value)}
            placeholder="Enter accession number (e.g., ACC12345)"
            className="search-input"
            disabled={loading}
          />
          <button type="submit" className="search-button" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner"></span>
                Searching...
              </>
            ) : (
              'Search'
            )}
          </button>
        </div>
      </form>

      {error && (
        <div className="error-message">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {results && (
        <div className="results-container">
          <div className="results-header">
            <h2>Search Results</h2>
            <span className="results-count">
              {results.count} {results.count === 1 ? 'document' : 'documents'} found for "{results.accessionNumber}"
            </span>
          </div>

          {results.count === 0 ? (
            <div className="no-results">
              <p>No documents found with accession number "{results.accessionNumber}"</p>
              <p className="hint">Please check the accession number and try again</p>
            </div>
          ) : (
            <div className="results-list">
              {results.results.map((file, index) => (
                <div key={index} className="file-card">
                  <div className="file-icon">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="file-info">
                    <h3 className="file-name">{file.name}</h3>
                    <div className="file-details">
                      <span className="file-size">{formatFileSize(file.size)}</span>
                      <span className="file-date">Modified: {formatDate(file.lastModified)}</span>
                    </div>
                  </div>
                  <a 
                    href={file.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="download-button"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FileSearch;