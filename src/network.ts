type PlayerID = 0 | 1 | 2 | 3 | 4;
enum NodeType {Normal, Factory, PowerPlant, Fort, Artillery};
const tickDuration = 500;

interface JSONNode {
    x: number,
    y: number,
    id: number,
    team: PlayerID,
    army: number,
    type: NodeType,
    assign: number,
    adj: number[]
}

class NetworkNode {
    public adj: NetworkNode[] = [];
    public id: number = -1;
    public team: PlayerID = 0;
    public army: number = 10;
    public type: NodeType = NodeType.Normal;
    public assign: NetworkNode | undefined = undefined;

    public constructor(
        public readonly x: number,
        public readonly y: number
    ) { }

    public static distance(p: NetworkNode, q: NetworkNode) {
        return Math.sqrt((p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y));
    }

    public static orientation(p: NetworkNode, q: NetworkNode, r: NetworkNode) {
        let val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
        return ((val > 0) ? 1 : ((val < 0) ? 2 : 0));
    }

    public static onSegment(p: NetworkNode, q: NetworkNode, r: NetworkNode) {
        return ((q.x <= Math.max(p.x, r.x))
             && (q.x >= Math.min(p.x, r.x))
             && (q.y <= Math.max(p.y, r.y))
             && (q.y >= Math.min(p.y, r.y)))
    }

    public static doIntersect(p1: NetworkNode, q1: NetworkNode, p2: NetworkNode, q2: NetworkNode): boolean {
        let o1 = NetworkNode.orientation(p1, q1, p2);
        let o2 = NetworkNode.orientation(p1, q1, q2);
        let o3 = NetworkNode.orientation(p2, q2, p1);
        let o4 = NetworkNode.orientation(p2, q2, q1);

        if (o1 !== o2 && o3 !== o4) {
            return true;
        } else if (o1 === 0 && NetworkNode.onSegment(p1, p2, q1)) {
            return true;
        } else if (o2 === 0 && NetworkNode.onSegment(p1, q2, q1)) {
            return true;
        } else if (o3 === 0 && NetworkNode.onSegment(p2, p1, q2)) {
            return true;
        } else if (o4 === 0 && NetworkNode.onSegment(p2, q1, q2)) {
            return true;
        } else {
            return false;
        }
    }
}

type JSONConnection = [number, number];

type Connection = [NetworkNode, NetworkNode];

interface JSONArmy {
    from: number,
    to: number,
    count: number,
    distance: number,
    team: PlayerID,
    id: number
}

interface Army {
    from: NetworkNode,
    to: NetworkNode,
    count: number,
    distance: number,
    team: PlayerID,
    id: number,
    finalDest: NetworkNode
}

interface JSONNetwork {
    nodes: JSONNode[],
    connections: JSONConnection[],
    armies: JSONArmy[]
}

class Network {
    public nodes: NetworkNode[] = [];
    public connections: Connection[] = [];
    public armies: Army[] = [];

    private tickListeners: (() => void)[] = [];
    private tickInterval: NodeJS.Timeout;
    private tick = 0;
    private armyCounter = 0;

    public constructor(
        private readonly numNodes = 64,
        private readonly minDist = 8,
        private readonly maxDist = 12,
        private readonly maxAdj = 5
    ) {
        let initNode = new NetworkNode(0, 0);
        initNode.id = 0;
        let nodeQueue: NetworkNode[] = [initNode];
        this.nodes.push(initNode);

        while (nodeQueue.length > 0 && this.nodes.length < this.numNodes) {
            let node = nodeQueue.shift();
            if (node === undefined) continue;
            if (node.adj.length >= this.maxAdj) continue;

            let nearbyNodes = this.getNearbyNodes(node);
            let nearbyConnections = this.getNearbyConnections(node);
            let choices = this.getPossibleChoices(node, nearbyNodes);

            while (node.adj.length < this.maxAdj
                && this.nodes.length < this.numNodes
                && choices.length > 0)
            {
                let newNode = choices[Math.floor(Math.random() * choices.length)];

                for (let otherNode of nearbyNodes) {
                    if (otherNode.adj.length >= this.maxAdj) continue;
                    if (newNode.adj.length >= this.maxAdj) break;
                    let dist = NetworkNode.distance(newNode, otherNode);
                    if (dist < this.minDist || dist > this.maxDist) continue;

                    let isFeasibleConnection = true;
                    for (let connection of nearbyConnections) {
                        if (connection[0] === newNode || connection[0] === otherNode
                         || connection[1] === newNode || connection[1] === otherNode)
                            continue;
                        if (NetworkNode.doIntersect(newNode, otherNode, connection[0], connection[1])) {
                            isFeasibleConnection = false;
                            break;
                        }
                    }
                    if (!isFeasibleConnection) continue;

                    newNode.adj.push(otherNode);
                    otherNode.adj.push(newNode);
                    this.connections.push([newNode, otherNode]);
                    nearbyConnections.push([newNode, otherNode]);
                }

                let newChoices = [];
                for (let otherNode of choices)
                    if (!this.isInvasive(newNode, otherNode))
                        newChoices.push(otherNode);
                choices = newChoices;

                newNode.id = this.nodes.length;
                this.nodes.push(newNode);
                nearbyNodes.push(newNode);
                nodeQueue.push(newNode);
            }
        }

        for (let i = 0; i < Math.min(this.nodes.length, 4); i++) {
            let node = this.nodes[Math.floor(Math.random() * this.nodes.length)];
            while (node.team != 0) {
                node = this.nodes[Math.floor(Math.random() * this.nodes.length)];
            }
            node.team = i + 1 as PlayerID;
            node.army = 30;
        }

        this.tickInterval = setInterval(() => {
            this.tick++;

            if (this.tick % 2 == 0)
                for (let node of this.nodes) {
                    let mult = 1;
                    for (let adjNode of node.adj)
                        if (adjNode.team === node.team && adjNode.type === NodeType.PowerPlant) {
                            mult++;
                        }
                    node.army += (node.type == NodeType.Factory) ? (mult * 2) : (node.team == 0 && this.tick % 8 == 0) ? 0 : 1;
                    if (node.assign !== undefined) {
                        const success = (this.tick % 8 === 0) ? this.sendArmy(node, node.assign, node.army) : (this.dijkstra(node, node.assign) !== undefined);
                        if (!success) {
                            node.assign = undefined;
                        }
                    }
                }

            // handle armies in order of farthest along connection to not far along connection
            const sortedArmies = this.armies.sort((a: Army, b: Army) => b.count - a.count);
            for (let army of sortedArmies) {
                const distance = Math.round(Math.sqrt((army.to.x-army.from.x)*(army.to.x-army.from.x)+(army.to.y-army.from.y)*(army.to.y-army.from.y)));
                if (army.distance === distance - 1) { // if approaching node
                    if (army.team !== army.to.team) { // enemy node
                        const [newToArmy, newArmyCount] = Network.nodeFight(army.to, army);
                        if (newToArmy <= 0) { // if node defeated
                            army.to.type = NodeType.Normal; // pillage buildings!!!
                            army.to.assign = undefined; // remove assignment
                            army.count = 0; // erase attacking army
                            if (newArmyCount > 0) { // if won, populate with attacking team
                                army.to.team = army.team;
                                army.to.army = newArmyCount;
                            } else if (newArmyCount <= 0) { // if drew, make neutral
                                army.to.team = 0;
                                army.to.army = 0;
                            }
                        } else { // if node still stands
                            army.count = newArmyCount;
                            army.to.army = newToArmy;
                        }
                    } else { // friendly node
                        army.to.army += army.count; // combine into node
                        if (army.finalDest !== army.to) // send army to further destination if needed
                            this.sendArmy(army.to, army.finalDest, army.count);
                        army.count = 0; // erase army
                    }
                } else { // check to see if colliding with other armies
                    let collided = false;
                    for (let otherArmy of sortedArmies) {
                        if (army.to === otherArmy.to && army.from === otherArmy.from
                            && army.distance === otherArmy.distance - 1) { // same direction collision
                            if (army.team === otherArmy.team && army.finalDest === otherArmy.finalDest) { // friendly army heading to same direction
                                otherArmy.count += army.count; // combine into front army
                                army.count = 0; // erase behind army
                            } else { // enemy army, attack from behind
                                const [newArmyCount, newOtherArmyCount] = Network.armyFight(army, otherArmy);
                                army.count = newArmyCount;
                                otherArmy.count = newOtherArmyCount;
                            }
                            collided = true;
                            break;
                        } else if (army.to === otherArmy.from && army.from === otherArmy.to
                            && (army.distance + otherArmy.distance) === (distance - 1)
                            && army.team !== otherArmy.team) { // opposite direction collision
                            const [newArmyCount, newOtherArmyCount] = Network.armyFight(army, otherArmy);
                            army.count = newArmyCount;
                            otherArmy.count = newOtherArmyCount;
                            collided = true;
                            break;
                        }
                    }
                    if (!collided) army.distance++; // move forward if not blocked
                }
            }

            // erase armies with 0 or below
            const newArmies = [];
            for (let army of sortedArmies) {
                if (army.count > 0) {
                    newArmies.push(army);
                }
            }
            this.armies = newArmies;

            for (let tickListener of this.tickListeners) {
                tickListener();
            }
        }, tickDuration);
    }

    public attachTickListener(func: () => void) {
        this.tickListeners.push(func);
    }

    public destroy() {
        clearInterval(this.tickInterval);
        this.tickListeners = [];
    }

    private dijkstra(from: NetworkNode, to: NetworkNode): NetworkNode | undefined {
        const dist: Record<number, number> = {};
        const prev: Record<number, number> = {};
        const done: Record<number, boolean> = {};
        for (let node of this.nodes) {
            dist[node.id] = Infinity;
            prev[node.id] = -1;
        }
        dist[from.id] = 0;
        while (true) {
            let nextNodeID = -1;
            for (let node of this.nodes)
                if (!(done[node.id]) && (nextNodeID === -1 || dist[node.id] < dist[nextNodeID]))
                    nextNodeID = node.id;
            if (nextNodeID === -1 || dist[nextNodeID] === Infinity) return undefined;
            if (nextNodeID === to.id) break;
            done[nextNodeID] = true;
            const nextNode = this.nodes[nextNodeID];
            for (let adjNode of nextNode.adj) {
                if (!(done[adjNode.id]) && (adjNode === to || adjNode.team === from.team)) {
                    const distBtwn = Math.sqrt((nextNode.x-adjNode.x)*(nextNode.x-adjNode.x)+(nextNode.y-adjNode.y)*(nextNode.y-adjNode.y))
                    if (dist[nextNodeID] + distBtwn < dist[adjNode.id]) {
                        dist[adjNode.id] = dist[nextNodeID] + distBtwn;
                        prev[adjNode.id] = nextNodeID;
                    }
                }
            }
        }
        let targetID = to.id;
        while (prev[targetID] !== from.id) {
            targetID = prev[targetID];
            if (targetID === -1) return undefined;
        }
        return this.nodes[targetID];
    }

    public sendArmy(from: NetworkNode, to: NetworkNode, count: number): boolean {
        if (count === 0 || from.army < count || from.team === 0) return true;
        const target = this.dijkstra(from, to);
        if (target === undefined) return false;
        from.army -= count;
        this.armies.push({
            from: from,
            to: target,
            count: count,
            distance: 1,
            team: from.team,
            id: this.armyCounter++,
            finalDest: to
        });
        return true;
    }

    public unassign(from: NetworkNode) {
        from.assign = undefined;
    }

    public assign(from: NetworkNode, to: NetworkNode) {
        if (from.team === 0) return;
        const target = this.dijkstra(from, to);
        from.assign = (target === undefined) ? undefined : to;
    }

    public stringify(): string {
        let jsonNetwork: JSONNetwork = {
            nodes: [],
            connections: [],
            armies: []
        }
        for (let node of this.nodes) {
            const jsonNode : JSONNode = {
                x: node.x,
                y: node.y,
                id: node.id,
                team: node.team,
                army: node.army,
                type: node.type,
                assign: (node.assign !== undefined) ? node.assign.id : -1,
                adj: []
            }
            for (let otherNode of node.adj) {
                jsonNode.adj.push(otherNode.id);
            }
            jsonNetwork.nodes.push(jsonNode);
        }
        for (let connection of this.connections) {
            jsonNetwork.connections.push([connection[0].id, connection[1].id]);
        }
        for (let army of this.armies) {
            const jsonArmy: JSONArmy = {
                from: army.from.id,
                to: army.to.id,
                count: army.count,
                distance: army.distance,
                team: army.team,
                id: army.id
            }
            jsonNetwork.armies.push(jsonArmy);
        }
        return JSON.stringify(jsonNetwork);
    }

    private static nodeFight(node: NetworkNode, army: Army): [number, number] {
        if (node.army === 0 || army.count === 0)
            return [node.army, army.count];
        let nodeloss = 0, armyloss = 0;
        const nodelossmult = (army.from.team === army.team && army.from.type === NodeType.Artillery) ? 1.5 : 1;
        const nodedefensemult = (node.type === NodeType.Fort) ? 2/3 : 1;
        const armylossmult = (node.type === NodeType.Artillery) ? 1.5 : 1;
        if (node.army < army.count) {
            armyloss = army.count / 80 * (.9 + Math.random() * .2);
            nodeloss = armyloss * (army.count / node.army);
        } else if (node.army > army.count) {
            nodeloss = node.army / 80 * (.9 + Math.random() * .2);
            armyloss = nodeloss * (node.army / army.count);
        } else {
            nodeloss = node.army / 80 * (.9 + Math.random() * .2);
            armyloss = army.count / 80 * (.9 + Math.random() * .2);
        }
        return [node.army - Math.ceil(nodeloss * nodelossmult * nodedefensemult), army.count - Math.ceil(armyloss * armylossmult)];
    }

    private static armyFight(army1: Army, army2: Army): [number, number] {
        if (army1.count === 0 || army2.count === 0)
            return [army1.count, army2.count];
        let army1loss = 0, army2loss = 0;
        const army1lossmult = (army2.from.team === army2.team && army2.from.type === NodeType.Artillery) ? 1.5 : 1;
        const army2lossmult = (army1.from.team === army1.team && army1.from.type === NodeType.Artillery) ? 1.5 : 1;
        if (army1.count < army2.count) {
            army2loss = army2.count / 80 * (.9 + Math.random() * .2);
            army1loss = army2loss * (army2.count / army1.count);
        } else if (army1.count > army2.count) {
            army1loss = army1.count / 80 * (.9 + Math.random() * .2);
            army2loss = army1loss * (army1.count / army2.count);
        } else {
            army1loss = army1.count / 80 * (.9 + Math.random() * .2);
            army2loss = army2.count / 80 * (.9 + Math.random() * .2);
        }
        return [army1.count - Math.ceil(army1loss * army1lossmult), army2.count - Math.ceil(army2loss * army2lossmult)];
    }

    private isNearby(p: NetworkNode, q: NetworkNode) {
        return (NetworkNode.distance(p, q) <= this.maxDist * 2);
    }

    private isInvasive(p: NetworkNode, q: NetworkNode) {
        return (NetworkNode.distance(p, q) < this.minDist);
    }

    private getNearbyNodes(node: NetworkNode): NetworkNode[] {
        let nearbyNodes: NetworkNode[] = [];
        for (let otherNode of this.nodes) {
            if (this.isNearby(node, otherNode))
                nearbyNodes.push(otherNode);
        }
        return nearbyNodes;
    }

    private getNearbyConnections(node: NetworkNode): Connection[] {
        let nearbyConnections: Connection[] = [];
        for (let connection of this.connections) {
            if (this.isNearby(node, connection[0]) || this.isNearby(node, connection[1]))
                nearbyConnections.push(connection);
        }
        return nearbyConnections;
    }

    private getPossibleChoices(node: NetworkNode, nearbyNodes: NetworkNode[]): NetworkNode[] {
        const resolution = 4;
        let choices: NetworkNode[] = [];
        for (let i = 0; i < this.maxAdj * resolution; i++) 
            for (let j = this.minDist; j < this.maxDist; j++) {
                let ang = 2 * Math.PI * i / (this.maxAdj * resolution);
                let proposedNode = new NetworkNode(
                    node.x + Math.cos(ang) * j,
                    node.y + Math.sin(ang) * j
                );
                let isNotInvasive = true;
                for (let otherNode of nearbyNodes)
                    if (this.isInvasive(proposedNode, otherNode)) {
                        isNotInvasive = false;
                        break;
                    }
                if (isNotInvasive)
                    choices.push(proposedNode);
            }
        return choices;
    }
}

export default Network;