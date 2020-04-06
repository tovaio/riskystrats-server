import Player from '../Player';

/*
    MapNode:
    Class representing a single node on the game map.
*/
class MapNode {

    /*
        INSTANCE PROPERTIES
    */
    public adj: MapNode[] = [];                                 // Array of adjacent MapNodes.
    public id: number = -1;                                     // ID of the node (for use when sending non-recursive node data to clients)
    public team: Player.Team = Player.Team.Neutral;             // Team associated with the node as a PlayerID
    public troops: number = 10;                                 // Number of troops stationed on this node (default = 10)
    public type: MapNode.NodeType = MapNode.NodeType.Normal;    // Type of building present on this node as a MapNode.NodeType
    public assign: MapNode | undefined = undefined;             // Node to automatically send troops to.
    public wasAttacked: boolean = false;                        // Marks whether an army attacked this node or not. Resets to false every tick.

    /*
        CONSTRUCTOR
    */
    public constructor (
        public x: number,                                       // X position of node
        public y: number                                        // Y position of node
    ) { }

    /*
        STATIC METHODS
    */
    // Calculate the distance from a node to another node.
    public static distance(p: MapNode, q: MapNode) {
        return Math.sqrt((p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y));
    }

    // Calculate the rounded integer distance from a node to another node
    public static intDistance(p: MapNode, q: MapNode) {
        return Math.round(MapNode.distance(p, q));
    }

    // Calculate the orientation (clockwise, counter-clockwise, collinear) for three nodes.
    // Key: 0 is collinear, 1 is counterclockwise, 2 is clockwise (or the other way around, I forget!)
    public static orientation(p: MapNode, q: MapNode, r: MapNode) {
        let val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
        return ((val > 0) ? 1 : ((val < 0) ? 2 : 0));
    }

    // Determines if node q lies on the segment joining nodes p and r
    public static onSegment(p: MapNode, q: MapNode, r: MapNode) {
        return ((q.x <= Math.max(p.x, r.x))
             && (q.x >= Math.min(p.x, r.x))
             && (q.y <= Math.max(p.y, r.y))
             && (q.y >= Math.min(p.y, r.y)))
    }

    // Determines if the segment joining nodes p1 and q1 intersects the segment joining
    // nodes p2 and q2.
    public static doIntersect(p1: MapNode, q1: MapNode, p2: MapNode, q2: MapNode): boolean {
        let o1 = MapNode.orientation(p1, q1, p2);
        let o2 = MapNode.orientation(p1, q1, q2);
        let o3 = MapNode.orientation(p2, q2, p1);
        let o4 = MapNode.orientation(p2, q2, q1);

        if (o1 !== o2 && o3 !== o4) {
            return true;
        } else if (o1 === 0 && MapNode.onSegment(p1, p2, q1)) {
            return true;
        } else if (o2 === 0 && MapNode.onSegment(p1, q2, q1)) {
            return true;
        } else if (o3 === 0 && MapNode.onSegment(p2, p1, q2)) {
            return true;
        } else if (o4 === 0 && MapNode.onSegment(p2, q1, q2)) {
            return true;
        } else {
            return false;
        }
    }

    /*
        INSTANCE METHODS
    */
    // Update this node's population
    public tick(tickNumber: number) {
        if (tickNumber % 2 !== 0 || this.wasAttacked) {
            this.wasAttacked = false;
            return;
        }

        let mult = 1;
        for (let adjNode of this.adj)
            if (adjNode.team === this.team && adjNode.type === MapNode.NodeType.PowerPlant) {
                mult++;
            }
        if (this.type == MapNode.NodeType.Factory) {
            this.troops += mult * 2;
        } else {
            this.troops += 1;
        }
    }

    // Convert this node to a non-recursive JSON format
    public toJSON(): MapNode.MapNodeJSON {
        const nodeJSON : MapNode.MapNodeJSON = {
            x: this.x,
            y: this.y,
            id: this.id,
            team: this.team,
            troops: this.troops,
            type: this.type,
            assign: (this.assign !== undefined) ? this.assign.id : -1,
            adj: []
        }
        for (let otherNode of this.adj) {
            nodeJSON.adj.push(otherNode.id);
        }
        return nodeJSON;
    }

}

/*
    MapNodeJSON:
    Interface for JSON format of a non-recursive map node structure
    to be sent to clients.

    NodeType:
    Enum of the different buildings that can be on a node.
*/
namespace MapNode {
    export interface MapNodeJSON {
        x: number,
        y: number,
        id: number,
        team: Player.Team,
        troops: number,
        type: NodeType,
        assign: number,
        adj: number[]
    }

    export enum NodeType {
        Normal,         // No building (default for all nodes)
        Factory,        // Factory (generates more troops per second)
        PowerPlant,     // PowerPlant (increases production output of adjacent factories)
        Fort,           // Fort (adds defensive bonus against incoming enemy armies)
        Artillery       // Artillery (adds offensive bonus to outgoing friendly armies)
    }
}

export default MapNode;