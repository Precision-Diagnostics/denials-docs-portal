const crypto = require('crypto');
global.crypto = crypto;

const { BlobServiceClient } = require("@azure/storage-blob");

// ... rest of your code

module.exports = async function (context, req) {
    context.log('Search function triggered');
    
    const accessionNumber = req.query.accessionNumber;
    
    context.log('Accession number:', accessionNumber);
    
    if (!accessionNumber) {
        context.res = {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: "Please provide an accessionNumber parameter" })
        };
        return;
    }

    try {
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        const containerName = process.env.AZURE_CONTAINER_NAME || "documents";
        
        context.log('Container name:', containerName);
        context.log('Connection string exists:', !!connectionString);
        
        if (!connectionString) {
            context.log.error('AZURE_STORAGE_CONNECTION_STRING is not configured');
            context.res = {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: "Storage connection not configured" })
            };
            return;
        }
        
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = blobServiceClient.getContainerClient(containerName);
        
        context.log('Starting blob search...');
        const results = [];
        
        // Search through blobs for matching accession number
        for await (const blob of containerClient.listBlobsFlat()) {
            if (blob.name.includes(accessionNumber)) {
                const blobClient = containerClient.getBlobClient(blob.name);
                
                results.push({
                    name: blob.name,
                    url: blobClient.url,
                    size: blob.properties.contentLength,
                    lastModified: blob.properties.lastModified,
                    contentType: blob.properties.contentType
                });
            }
        }
        
        context.log('Found results:', results.length);
        
        context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                count: results.length,
                accessionNumber: accessionNumber,
                results: results
            })
        };
    } catch (error) {
        context.log.error('Search error:', error);
        context.res = {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                error: `Search failed: ${error.message}`,
                details: error.toString()
            })
        };
    }
};
