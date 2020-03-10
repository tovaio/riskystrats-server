import Network from './network';
import socketio = require('socket.io');

type PlayerID = 0 | 1 | 2 | 3 | 4;
enum NodeType {Normal, Factory, PowerPlant, Fort, Artillery};

const costs = {
    [NodeType.Factory]: 200,
    [NodeType.PowerPlant]: 1000,
    [NodeType.Fort]: 500,
    [NodeType.Artillery]: 2000
};

const io = socketio(3001);
const net = new Network();

let players: (socketio.Socket | undefined)[] = [undefined, undefined, undefined, undefined];

net.attachTickListener(() => {
    io.emit('network', net.stringify());
});

io.on('connection', (socket) => {
    let playerID: PlayerID = 0;
    for (let index in players) {
        if (players[parseInt(index)] === undefined) {
            players[parseInt(index)] = socket;
            playerID = parseInt(index) + 1 as PlayerID;
            break;
        }
    }

    socket.emit('playerID', playerID);
    socket.emit('network', net.stringify());

    socket.on('capture', (nodeID: number) => {
        net.nodes[nodeID].team = playerID;
        net.nodes[nodeID].type = NodeType.Normal;
        io.emit('network', net.stringify());
    });

    socket.on('convert', (nodeID: number, type: NodeType) => {
        if (!(nodeID in net.nodes) || playerID === 0 || type === NodeType.Normal) return;
        const node = net.nodes[nodeID];
        if (node.team === playerID && node.type !== type && node.army >= costs[type]) {
            node.type = type;
            node.army -= costs[type];
            io.emit('network', net.stringify());
        }
    });

    socket.on('sendArmy', (fromNodeID: number, toNodeID: number, count: number) => {
        if (!(fromNodeID in net.nodes && toNodeID in net.nodes) || playerID === 0) return;
        const fromNode = net.nodes[fromNodeID];
        const toNode = net.nodes[toNodeID];
        if (fromNode.team === playerID) {
            net.sendArmy(fromNode, toNode, Math.min(count, fromNode.army));
            io.emit('network', net.stringify());
        }
    });

    socket.on('assign', (fromNodeID: number, toNodeID: number) => {
        if (!(fromNodeID in net.nodes) || playerID === 0) return;
        const fromNode = net.nodes[fromNodeID];
        if (toNodeID < 0) {
            net.unassign(fromNode);
            io.emit('network', net.stringify());
        } else if (toNodeID in net.nodes) {
            const toNode = net.nodes[toNodeID];
            if (fromNode.team === playerID) {
                net.assign(fromNode, toNode);
                io.emit('network', net.stringify());
            }
        }
    });

    socket.on('disconnect', () => {
        if (playerID > 0) {
            players[(playerID as number) - 1] = undefined;
        }
    });
});
