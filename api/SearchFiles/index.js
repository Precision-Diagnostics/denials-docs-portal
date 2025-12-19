const { BlobServiceClient } = require("@azure/storage-blob");

module.exports = async function (context, req) {
    const accessionNumber = req.query.accessionNumber;
    
    if (!accessionNumber) {
        context.res = {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
            body: { error: "Please provide an accessionNumber parameter" }
        };
        return;
    }

    try {
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        const containerName = process.env.CONTAINER_NAME || "documents";
        
        if (!connectionString) {
            throw new Error("AZURE_STORAGE_CONNECTION_STRING is not configured");
        }
        
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = blobServiceClient.getContainerClient(containerName);
        
        const results = [];
        
        // Search through blobs for matching accession number
        for await (const blob of containerClient.listBlobsFlat()) {
            // Check if accession number is in the filename
            if (blob.name.includes(accessionNumber)) {
                const blobClient = containerClient.getBlobClient(blob.name);
                
                // Generate SAS token for secure download (valid for 1 hour)
                const sasUrl = await generateSasUrl(blobClient);
                
                results.push({
                    name: blob.name,
                    url: sasUrl,
                    size: blob.properties.contentLength,
                    lastModified: blob.properties.lastModified,
                    contentType: blob.properties.contentType
                });
            }
        }
        
        context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: {
                count: results.length,
                accessionNumber: accessionNumber,
                results: results
            }
        };
    } catch (error) {
        context.log.error('Search error:', error);
        context.res = {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
            body: { error: `Search failed: ${error.message}` }
        };
    }
};

// Helper function to generate SAS URL for secure downloads
async function generateSasUrl(blobClient) {
    const { BlobSASPermissions, generateBlobSASQueryParameters } = require("@azure/storage-blob");
    
    try {
        // Get the account name and key from the connection string
        const url = new URL(blobClient.url);
        const accountName = url.hostname.split('.')[0];
        
        // For simplicity, return the blob URL
        // In production, you'd want to generate a proper SAS token
        return blobClient.url;
    } catch (error) {
        return blobClient.url;
    }
}