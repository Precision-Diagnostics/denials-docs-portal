const https = require('https');
const crypto = require('crypto');

module.exports = async function (context, req) {
    try {
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        const containerName = process.env.AZURE_CONTAINER_NAME || "documents";
        const accessionNumber = req.query.accessionNumber || "";
        
        if (!accessionNumber) {
            context.res = {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: "Please provide an accessionNumber parameter" })
            };
            return;
        }
        
        const parts = {};
        connectionString.split(';').forEach(part => {
            const idx = part.indexOf('=');
            if (idx > 0) {
                parts[part.substring(0, idx)] = part.substring(idx + 1);
            }
        });
        
        const accountName = parts['AccountName'];
        const accountKey = parts['AccountKey'];
        
        const date = new Date().toUTCString();
        const version = '2020-10-02';
        
        const canonicalizedResource = `/${accountName}/${containerName}\ncomp:list\nmaxresults:100\nprefix:${accessionNumber}\nrestype:container`;
        const stringToSign = `GET\n\n\n\n\n\n\n\n\n\n\n\nx-ms-date:${date}\nx-ms-version:${version}\n${canonicalizedResource}`;
        
        const keyBuffer = Buffer.from(accountKey, 'base64');
        const hmac = crypto.createHmac('sha256', keyBuffer);
        hmac.update(stringToSign, 'utf8');
        const signature = hmac.digest('base64');
        
        const path = `/${containerName}?restype=container&comp=list&maxresults=100&prefix=${encodeURIComponent(accessionNumber)}`;
        
        const result = await new Promise((resolve, reject) => {
            const options = {
                hostname: `${accountName}.blob.core.windows.net`,
                path: path,
                method: 'GET',
                headers: {
                    'x-ms-date': date,
                    'x-ms-version': version,
                    'Authorization': `SharedKey ${accountName}:${signature}`
                }
            };
            
            const httpsReq = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ statusCode: res.statusCode, data }));
            });
            httpsReq.on('error', (e) => resolve({ statusCode: 0, data: e.message }));
            httpsReq.end();
        });
        
        if (result.statusCode !== 200) {
            context.res = {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: `Storage API error: ${result.statusCode}` })
            };
            return;
        }
        
        // Parse blobs from XML
        const blobs = [];
        const blobRegex = /<Blob>[\s\S]*?<\/Blob>/g;
        const matches = result.data.match(blobRegex) || [];
        
        matches.forEach(blobXml => {
            const name = extractValue(blobXml, 'Name');
            const size = extractValue(blobXml, 'Content-Length');
            const lastModified = extractValue(blobXml, 'Last-Modified');
            const contentType = extractValue(blobXml, 'Content-Type');
            
            if (name) {
                // Generate SAS URL for download
                const sasUrl = generateSasUrl(accountName, accountKey, containerName, name);
                
                blobs.push({
                    name: name,
                    url: sasUrl,
                    size: parseInt(size) || 0,
                    lastModified: lastModified,
                    contentType: contentType || 'application/octet-stream'
                });
            }
        });
        
        context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                count: blobs.length,
                accessionNumber: accessionNumber,
                results: blobs
            })
        };
    } catch (error) {
        context.res = {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: error.message })
        };
    }
};

function extractValue(xml, tag) {
    const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`);
    const match = xml.match(regex);
    return match ? match[1] : null;
}

function generateSasUrl(accountName, accountKey, containerName, blobName) {
    const now = new Date();
    const start = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago
    const expiry = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
    
    const formatDate = (d) => d.toISOString().substring(0, 19) + 'Z';
    
    const permissions = 'r'; // read only
    const version = '2020-10-02';
    const resource = 'b'; // blob
    const contentDisposition = `attachment; filename="${blobName}"`;
    
    const stringToSign = [
        permissions,                                              // sp
        formatDate(start),                                        // st
        formatDate(expiry),                                       // se
        `/blob/${accountName}/${containerName}/${blobName}`,      // canonicalized resource
        '',                                                       // signedIdentifier
        '',                                                       // signedIP
        '',                                                       // signedProtocol
        version,                                                  // sv
        resource,                                                 // sr (b for blob)
        '',                                                       // snapshot time
        '',                                                       // rscc (cache-control)
        contentDisposition,                                       // rscd (content-disposition)
        '',                                                       // rsce (content-encoding)
        '',                                                       // rscl (content-language)
        ''                                                        // rsct (content-type)
    ].join('\n');
    
    const keyBuffer = Buffer.from(accountKey, 'base64');
    const hmac = crypto.createHmac('sha256', keyBuffer);
    hmac.update(stringToSign, 'utf8');
    const signature = hmac.digest('base64');
    
    const sasParams = new URLSearchParams({
        'sv': version,
        'st': formatDate(start),
        'se': formatDate(expiry),
        'sr': resource,
        'sp': permissions,
        'rscd': contentDisposition,
        'sig': signature
    });
    
    return `https://${accountName}.blob.core.windows.net/${containerName}/${encodeURIComponent(blobName)}?${sasParams.toString()}`;
}
