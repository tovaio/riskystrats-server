import Map from './Map/Map';
import MapNode from './Map/MapNode';
import MapArmy from './Map/MapArmy';
import Player from './Player';

/*
    GameJSON:
    JSON interface for Game class
*/
namespace Game {
    export interface GameJSON {
        map: Map.MapJSON,
        armies: MapArmy.MapArmyJSON[]
    }
}

/* 
    Game:
    Class which represents a single game of riskystrats and provides control for the game map
*/
class Game {

    /*
        STATIC PROPERTIES
    */
    private static buildingCosts = {                // Costs of different buildings in the game
        [MapNode.NodeType.Factory]:     200,
        [MapNode.NodeType.PowerPlant]:  1000,
        [MapNode.NodeType.Fort]:        500,
        [MapNode.NodeType.Artillery]:   2000
    }

    /*
        INSTANCE PROPERTIES
    */
    public map: Map;                                // The map this game is being played on
    public tickNumber: number = 0;                  // Number of ticks elapsed since the creation of this game
    public armies: MapArmy[] = [];                  // Array of travelling armies in the game

    private armyCounter: number = 0;                // Number of armies created since the game started, for assigning IDs to armies

    /*
        CONSTRUCTOR
    */
    public constructor(
        public readonly nPlayers                    // The number of players in this game (between 2 and 6, inclusive)
    ) {
        if (nPlayers < 2 || nPlayers > 6) {
            throw new Error("Invalid number of players! (must be between 2 and 8, inclusive)");
        }

        // Generate map
        this.map = new Map(32 * nPlayers);

        // Choose starting positions for players
        const unselectedNodes = [...this.map.nodes];
        for (let i = 0; i < nPlayers; i++) {
            const [node] = unselectedNodes.splice(Math.floor(Math.random() * unselectedNodes.length), 1);
            node.team = i + 1 as Player.Team;
            node.troops = 30;
        }
    }

    /*
        INSTANCE METHODS
    */
    // Simulate one tick of the game
    public tick() {
        this.tickNumber++;

        // Update armies
        const [newArmies, armiesToSend] = MapArmy.tick(this.armies);
        this.armies = newArmies;

        // Update each node
        for (let node of this.map.nodes) {
            node.tick(this.tickNumber)

            if (node.assign !== undefined && this.tickNumber % 8 == 0) {
                const success = this.sendArmy(node.team, node, node.assign, node.troops);
                if (!success) {
                    node.assign = undefined;
                }
            }
        }

        // Send new armies
        armiesToSend.forEach(([to, from, troops]) => this.sendArmy(to.team, to, from, troops));
    }

    // Get a node by its ID
    public getNodeByID(nodeID: number): MapNode | undefined {
        if (nodeID < 0 || nodeID >= this.map.nodes.length)
            return undefined;
        else
            return this.map.nodes[nodeID];
    }

    // Build a building on a node
    public build(team: Player.Team, node: MapNode, type: MapNode.NodeType): boolean {
        if (team === Player.Team.Neutral || !(type in Game.buildingCosts)) return false;

        if (node.team === team && node.type !== type && node.troops >= Game.buildingCosts[type]) {
            node.type = type;
            node.troops -= Game.buildingCosts[type];
            return true;
        } else return false;
    }

    // Send army of size 'troops' from node 'from' to node 'to'
    public sendArmy(team: Player.Team, from: MapNode, to: MapNode, troops: number): boolean {
        if (from.team !== team || team === Player.Team.Neutral) return false;

        // Check if an enemy army is attacking this node along this edge; if so, don't send an army
        for (let army of this.armies) {
            if (army.from === to && army.to === from && army.team !== team && army.distance === MapNode.intDistance(from, to))
                return false;
        }

        troops = Math.min(troops, from.troops);

        if (troops === 0) return true;

        const target = this.dijkstra(from, to);
        if (target === undefined) return false;

        from.troops -= troops;
        this.armies.push(new MapArmy(from, target, troops, from.team, to, this.armyCounter++));

        return true;
    }

    // Assign node 'from' to auto-feed troops to node 'to'
    public assign(team: Player.Team, from: MapNode, to: MapNode): boolean {
        if (team === Player.Team.Neutral || from.team !== team) return false;

        const target = this.dijkstra(from, to);
        from.assign = (target === undefined) ? undefined : to;

        return true;
    }

    // Unassign node 'from' from auto-feeding
    public unassign(team: Player.Team, from: MapNode): boolean {
        if (team === Player.Team.Neutral || from.team !== team) return false;

        from.assign = undefined;

        return true;
    }

    // Forfeit a player from the game
    public forfeit(team: Player.Team): boolean {
        if (team === Player.Team.Neutral) return false;

        // Reset nodes
        for (let node of this.map.nodes) {
            if (node.team === team) {
                node.team = Player.Team.Neutral;
                node.type = MapNode.NodeType.Normal;
                node.troops = 0;
            }
        }

        // Remove armies
        const newArmies: MapArmy[] = [];
        for (let army of this.armies) {
            if (army.team !== team) {
                newArmies.push(army);
            }
        }
        this.armies = newArmies;
        
        return true;
    }

    // Convert all game info into a non-recursive JSON string
    public toJSON(): Game.GameJSON {
        return {
            map: this.map.toJSON(),
            armies: this.armies.map(army => army.toJSON())
        };
    }

    // Determines the next node to go from node 'from' to node 'to'
    private dijkstra(from: MapNode, to: MapNode): MapNode | undefined {
        const dist: Record<number, number> = {};
        const prev: Record<number, number> = {};
        const done: Record<number, boolean> = {};

        for (let node of this.map.nodes) {
            dist[node.id] = Infinity;
            prev[node.id] = -1;
        }

        dist[from.id] = 0;

        while (true) {
            let nextNodeID = -1;

            for (let node of this.map.nodes)
                if (!(done[node.id]) && (nextNodeID === -1 || dist[node.id] < dist[nextNodeID]))
                    nextNodeID = node.id;

            if (nextNodeID === -1 || dist[nextNodeID] === Infinity) return undefined;
            if (nextNodeID === to.id) break;

            done[nextNodeID] = true;
            const nextNode = this.map.nodes[nextNodeID];

            for (let adjNode of nextNode.adj) {
                if (!(done[adjNode.id]) && (adjNode === to || adjNode.team === from.team)) {
                    const distBtwn = MapNode.distance(nextNode, adjNode);

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

        return this.map.nodes[targetID];
    }

}

export default Game;