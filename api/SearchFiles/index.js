const https = require('https');
const crypto = require('crypto');

module.exports = async function (context, req) {
    try {
        const accessionNumber = req.query.accessionNumber || "";

        if (!accessionNumber) {
            context.res = {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: "Please provide an accessionNumber parameter" })
            };
            return;
        }

        // Configure each storage source. Add more entries here to search additional containers.
        const sources = [
            {
                label: "CareEvolve",
                connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
                containerName: process.env.AZURE_CONTAINER_NAME || "documents"
            },
            {
                label: "EHR",
                connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING_2,
                containerName: process.env.AZURE_CONTAINER_NAME_2 || "hl7pdfs"
            }
        ].filter(s => s.connectionString);

        // Query all sources in parallel; a failure in one source doesn't fail the whole search
        const perSource = await Promise.all(
            sources.map(s => searchContainer(s, accessionNumber).catch(err => {
                context.log.error(`Source ${s.label} failed:`, err.message);
                return [];
            }))
        );

        const blobs = perSource.flat();
        blobs.sort((a, b) => a.name.localeCompare(b.name));

        context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                count: blobs.length,
                accessionNumber,
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

async function searchContainer(source, accessionNumber) {
    const parts = {};
    source.connectionString.split(';').forEach(part => {
        const idx = part.indexOf('=');
        if (idx > 0) parts[part.substring(0, idx)] = part.substring(idx + 1);
    });

    const accountName = parts['AccountName'];
    const accountKey = parts['AccountKey'];
    const containerName = source.containerName;

    const date = new Date().toUTCString();
    const version = '2020-10-02';

    const canonicalizedResource = `/${accountName}/${containerName}\ncomp:list\nmaxresults:100\nprefix:${accessionNumber}\nrestype:container`;
    const stringToSign = `GET\n\n\n\n\n\n\n\n\n\n\n\nx-ms-date:${date}\nx-ms-version:${version}\n${canonicalizedResource}`;

    const keyBuffer = Buffer.from(accountKey, 'base64');
    const hmac = crypto.createHmac('sha256', keyBuffer);
    hmac.update(stringToSign, 'utf8');
    const signature = hmac.digest('base64');

    const path = `/${containerName}?restype=container&comp=list&maxresults=100&prefix=${encodeURIComponent(accessionNumber)}`;

    const result = await new Promise((resolve) => {
        const options = {
            hostname: `${accountName}.blob.core.windows.net`,
            path,
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
        throw new Error(`Storage API ${result.statusCode}: ${result.data}`);
    }

    const blobs = [];
    const matches = result.data.match(/<Blob>[\s\S]*?<\/Blob>/g) || [];

    matches.forEach(blobXml => {
        const name = extractValue(blobXml, 'Name');
        const size = extractValue(blobXml, 'Content-Length');
        const lastModified = extractValue(blobXml, 'Last-Modified');
        const contentType = extractValue(blobXml, 'Content-Type');

        if (name) {
            blobs.push({
                name,
                url: generateSasUrl(accountName, accountKey, containerName, name),
                size: parseInt(size) || 0,
                lastModified,
                contentType: contentType || 'application/octet-stream',
                source: source.label
            });
        }
    });

    return blobs;
}

function extractValue(xml, tag) {
    const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
    return match ? match[1] : null;
}

function generateSasUrl(accountName, accountKey, containerName, blobName) {
    const now = new Date();
    const start = new Date(now.getTime() - 5 * 60 * 1000);
    const expiry = new Date(now.getTime() + 60 * 60 * 1000);
    const formatDate = (d) => d.toISOString().substring(0, 19) + 'Z';

    const permissions = 'r';
    const version = '2020-10-02';
    const resource = 'b';
    const contentDisposition = `attachment; filename="${blobName}"`;

    const stringToSign = [
        permissions, formatDate(start), formatDate(expiry),
        `/blob/${accountName}/${containerName}/${blobName}`,
        '', '', '', version, resource, '', '', contentDisposition, '', '', ''
    ].join('\n');

    const keyBuffer = Buffer.from(accountKey, 'base64');
    const hmac = crypto.createHmac('sha256', keyBuffer);
    hmac.update(stringToSign, 'utf8');
    const signature = hmac.digest('base64');

    const sasParams = new URLSearchParams({
        sv: version,
        st: formatDate(start),
        se: formatDate(expiry),
        sr: resource,
        sp: permissions,
        rscd: contentDisposition,
        sig: signature
    });

    return `https://${accountName}.blob.core.windows.net/${containerName}/${encodeURIComponent(blobName)}?${sasParams.toString()}`;
}
