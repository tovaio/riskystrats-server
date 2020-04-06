import MapNode from './MapNode';

/*
    MapEdge:
    Convenient type definition for an edge between two nodes
*/
type MapEdge = [MapNode, MapNode];

/*
    MapJSON:
    JSON interface for Map class
*/
namespace Map {
    export interface MapJSON {
        nodes: MapNode.MapNodeJSON[]
        edges: [number, number][]
    }
}

/*
    Map:
    Class which represents the full game map, with nodes and edges
*/
class Map {

    /*
        INSTANCE PROPERTIES
    */
    public nodes: MapNode[] = [];                       // Array of nodes in this map
    public edges: MapEdge[] = [];                       // Array of edges in this map

    /*
        CONSTRUCTOR
    */
    public constructor(
        private readonly nNodes = 64,                   // Number of nodes to be generated 
        private readonly minDist = 8,                   // Minimum distance between two nodes
        private readonly maxDist = 12,                  // Maximum distance between two nodes
        private readonly maxAdj = 5                     // Maximum number of adjacent nodes for each node
    ) {
        const initNode = new MapNode(0, 0);
        initNode.id = 0;
        const nodeQueue: MapNode[] = [initNode];
        this.nodes.push(initNode);

        while (nodeQueue.length > 0 && this.nodes.length < this.nNodes) {
            const node = nodeQueue.shift();

            if (node === undefined) continue;
            if (node.adj.length >= this.maxAdj) continue;

            const nearbyNodes = this.getNearbyNodes(node);
            const nearbyConnections = this.getNearbyEdges(node);
            let choices = this.getPossibleChoices(node, nearbyNodes);

            while (node.adj.length < this.maxAdj
                && this.nodes.length < this.nNodes
                && choices.length > 0)
            {
                const newNode = choices[Math.floor(Math.random() * choices.length)];

                for (let otherNode of nearbyNodes) {
                    if (otherNode.adj.length >= this.maxAdj) continue;
                    if (newNode.adj.length >= this.maxAdj) break;

                    const dist = MapNode.distance(newNode, otherNode);

                    if (dist < this.minDist || dist > this.maxDist) continue;

                    let isFeasibleConnection = true;
                    for (let connection of nearbyConnections) {
                        if (connection[0] === newNode || connection[0] === otherNode
                         || connection[1] === newNode || connection[1] === otherNode)
                            continue;
                        if (MapNode.doIntersect(newNode, otherNode, connection[0], connection[1])) {
                            isFeasibleConnection = false;
                            break;
                        }
                    }

                    if (!isFeasibleConnection) continue;

                    newNode.adj.push(otherNode);
                    otherNode.adj.push(newNode);
                    this.edges.push([newNode, otherNode]);
                    nearbyConnections.push([newNode, otherNode]);
                }

                const newChoices = [];
                for (let otherNode of choices)
                    if (!this.areInvasive(newNode, otherNode))
                        newChoices.push(otherNode);
                choices = newChoices;

                newNode.id = this.nodes.length;
                this.nodes.push(newNode);
                nearbyNodes.push(newNode);
                nodeQueue.push(newNode);
            }
        }
    }

    /*
        INSTANCE METHODS
    */
    // Determines if two nodes are within 2 * maxDist of each other
    private areNearby(p: MapNode, q: MapNode) {
        return (MapNode.distance(p, q) <= this.maxDist * 2);
    }

    // Determines if two nodes are within minDist of each other
    private areInvasive(p: MapNode, q: MapNode) {
        return (MapNode.distance(p, q) < this.minDist);
    }

    // Determines the array of nodes that are nearby to the given node
    private getNearbyNodes(node: MapNode): MapNode[] {
        const nearbyNodes: MapNode[] = [];

        for (let otherNode of this.nodes)
            if (this.areNearby(node, otherNode))
                nearbyNodes.push(otherNode);

        return nearbyNodes;
    }

    // Determines the edges that involve one or more nodes that are nearby to the given node
    private getNearbyEdges(node: MapNode): MapEdge[] {
        const nearbyConnections: MapEdge[] = [];

        for (let connection of this.edges)
            if (this.areNearby(node, connection[0]) || this.areNearby(node, connection[1]))
                nearbyConnections.push(connection);

        return nearbyConnections;
    }

    // Gathers a list of possible new nodes that would be adjacent to a given node
    private getPossibleChoices(node: MapNode, nearbyNodes: MapNode[]): MapNode[] {
        const resolution = 4;
        const choices: MapNode[] = [];

        for (let i = 0; i < this.maxAdj * resolution; i++) {
            for (let j = this.minDist; j < this.maxDist; j++) {
                const ang = 2 * Math.PI * i / (this.maxAdj * resolution);

                const proposedNode = new MapNode(
                    node.x + Math.cos(ang) * j,
                    node.y + Math.sin(ang) * j
                );

                let isNotInvasive = true;
                for (let otherNode of nearbyNodes) {
                    if (this.areInvasive(proposedNode, otherNode)) {
                        isNotInvasive = false;
                        break;
                    }
                }

                if (isNotInvasive)
                    choices.push(proposedNode);
            }
        }
        
        return choices;
    }

    // Convert this Map instance into a JSON object
    public toJSON(): Map.MapJSON {
        return {
            nodes: this.nodes.map(node => node.toJSON()),
            edges: this.edges.map(([node1, node2]) => [node1.id, node2.id])
        };
    }

}

export default Map;