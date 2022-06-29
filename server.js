const fs = require('node:fs')
const url = require('node:url')
const path = require('node:path')
const http2 = require('node:http2')

const host = process.env.HOST || 'localhost'
const port = Number(process.env.PORT || '8000')
const sslKey = process.env.SSL_KEY || 'ssl.key'
const sslCert = process.env.SSL_CERT || 'ssl.cert'
const rootDir = path.resolve(__dirname)
const staticDir = path.join(rootDir, 'static')

/**
 * Attempts to stream a file over http2 stream.
 * @param stream - http2 stream.
 * @param filePath - path to file.
 */
function streamFile(stream, filePath) {
    const fileDesc = fs.openSync(filePath, 'r')
    stream.on('close', () => fs.closeSync(fileDesc))
    stream.respondWithFD(fileDesc)
}

/**
 * Attempts to perform server push.
 * @param stream - http2 stream.
 * @param fileUrl - file url path.
 * @param filePath - path to file.
 */
function serverPush(stream, fileUrl, filePath) {
    stream.pushStream({ ':path': fileUrl }, (err, pushStream) => {
        if (err) throw err
        streamFile(pushStream, filePath)
    })
}

/**
 * Returns http 404 response.
 */
function handleHttp404(req, res) {
    res.writeHead(404)
    res.end('Not found')
}

/**
 * Return http 500 response.
 */
function handleHttp500(req, res) {
    res.writeHead(500)
    res.end('Server error')
}

/**
 * Attempts to stream an index.html & if ?push=true
 * provided will push assets to preload them.
 */
function handleIndexPage(req, res) {
    console.group('New request received!')

    if (req.url.query.push !== undefined) {
        console.log('Sending server push ✨')
        serverPush(res.stream, '/static/styles.css', path.join(staticDir, 'styles.css'))
        serverPush(res.stream, '/static/scripts.js', path.join(staticDir, 'scripts.js'))
    }

    console.log('Sending html file 📝')
    streamFile(res.stream, path.join(rootDir, 'index.html'))
    console.groupEnd()
}

/**
 * Attempts to stream requested static file,
 * if there is no such file, will return 404 instead.
 */
function handleStaticFile(req, res) {
    console.group(`Serving static file "${req.url.pathname}"`)
    try {
        const fileName = req.url.pathname.split('/static')[1]
        streamFile(res.stream, path.join(staticDir, fileName))
    } catch(err) {
        const handle = err.code === 'ENOENT'
            ? handleHttp404
            : handleHttp500
        handle(req, res)
    } finally {
        console.groupEnd()
    }
}

/**
 * Attempts to route request to it's proper handler,
 * will return 404 if there is no handle for the request.
 */
function routeRequest(req, res) {
    req.url = url.parse(req.url, true)
    if (req.url.pathname === '/') {
        return handleIndexPage(req, res)
    } else if (req.url.pathname.startsWith('/static')) {
        return handleStaticFile(req, res)
    }
    handleHttp404(req, res)
}

/**
 * Runs http2 server over https.
 */
function runServer() {
    const server = http2.createSecureServer({
        key: fs.readFileSync(path.join(rootDir, sslKey)),
        cert: fs.readFileSync(path.join(rootDir, sslCert)),
    }, routeRequest)

    console.log(`Listening on https://${host}:${port}`)
    server.listen(port, host)
}

runServer()
