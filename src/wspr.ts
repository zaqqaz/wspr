import http, { IncomingMessage, ServerResponse } from 'http';
import WebSocket, { Server } from 'ws';
import portscanner from 'portscanner';

async function run() {
    let startingPort = 3005;

    // If client pass any parameter then it will choose a random port
    if(process.argv.slice(2)[0]) {
        startingPort = Math.floor(Math.random() * (3999 - 3005 + 1)) + 3005;
    }
    
    const wssPort = await portscanner.findAPortNotInUse(
        startingPort,
        startingPort + 1000
    );

    const wss = new WebSocket.Server({ port: wssPort });
    clientsListener(wss);
    console.log(`WebSocket server started ws://localhost:${wssPort}`);

    const server = http.createServer(
        async (request: IncomingMessage, response: ServerResponse) => {
            response.writeHead(200, { 'Content-Type': 'text plain' });
            if (request.method === 'POST') {
                const body = await collectRequestData(request);
                broadcast(wss, body);
                response.end('Message proxied');
            }
            response.end();
        }
    );

    const httpPort = await portscanner.findAPortNotInUse(
        startingPort,
        startingPort + 1000
    );

    server.listen(httpPort);
    console.log(`HTPP proxy server started http://localhost:${httpPort}`);

    process.on('SIGINT', () => {
        wss.close();
        process.exit(0);
    });
}

function clientsListener(wss: Server) {
    wss.on('connection', function connection(ws) {
        console.log(`Client connected at: ${Date.now()}`);
        ws.on('message', function incoming(message) {
            console.log('Message received from client: ', message);
        });
    });
}

function broadcast(wss: Server, message: string) {
    if (!wss.clients?.size) {
        console.log('No active clients');
        return;
    }

    console.log(
        `Broadcasting message to  ${wss.clients.size} clients: ${JSON.stringify(
            message
        )}`
    );
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function collectRequestData(request: IncomingMessage): Promise<string> {
    let resolve: (body: string) => void;

    const promise = new Promise<string>((_resolve) => {
        resolve = _resolve;
    });
    let body = '';
    request.on('data', (chunk) => {
        body += chunk.toString();
    });
    request.on('end', () => {
        resolve(body);
    });

    return promise;
}

run();
