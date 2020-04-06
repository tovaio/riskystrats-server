import Player from '../Player';
import MapNode from './MapNode';

/*
    MapArmyJSON:
    Interface for JSON format of a non-recursive map army structure
    to be sent to clients.
*/
namespace MapArmy {
    export interface MapArmyJSON {
        from: number,
        to: number,
        troops: number,
        distance: number,
        team: Player.Team,
        id: number
    }
}

/*
    MapArmy:
    Class representing a moving army on the game map.
*/
class MapArmy {

    /*
        STATIC PROPERTIES
    */
    private static readonly lossMeanRatio = 1 / 80;     // Ratio of meean losses to troop size
    private static readonly lossRadius = 0.1;           // Half of range of random loss multiplier

    /*
        INSTANCE PROPERTIES
    */
    public distance: number = 0;

    /*
        CONSTRUCTOR
    */
    public constructor (
        public from: MapNode,
        public to: MapNode,
        public troops: number,
        public team: Player.Team,
        public finalDest: MapNode,
        public id: number
    ) { };

    /*
        STATIC METHODS
    */
    // Determine if two armies are on the same path in the same direction
    public static sameDirection(a: MapArmy, b: MapArmy) {
        return (a.to == b.to && a.from == b.from);
    }

    // Determine if two armies are on the same path in the opposite direction
    public static oppositeDirection(a: MapArmy, b: MapArmy) {
        return (a.to == b.from && a.from == b.to);
    }

    // Determine if army a is colliding into the back of army b
    public static areCollidingTail(a: MapArmy, b: MapArmy) {
        return (MapArmy.sameDirection(a, b) && a.distance === b.distance - 1);
    }

    // Determine if army a is colliding headfirst into army b
    public static areCollidingHead(a: MapArmy, b: MapArmy) {
        return (MapArmy.oppositeDirection(a, b) && a.distance + b.distance === MapNode.intDistance(a.to, a.from) - 1);
    }
    
    // Simulate a tick of battle between two troops (army/army or army/node)
    public static battle(troopsA: number, troopsB: number, multA: number, multB: number): [number, number] {
        if (troopsA <= 0 || troopsB <= 0)
            return [Math.max(troopsA, 0), Math.max(troopsB, 0)];

        let lossesA = 0, lossesB = 0;

        // If one troop size is larger than the other, give that one advantage
        if (troopsA < troopsB) {
            lossesB = troopsB * MapArmy.lossMeanRatio * (1 - MapArmy.lossRadius + Math.random() * 2 * MapArmy.lossRadius);
            lossesA = lossesB * (troopsB / troopsA);
        } else if (troopsA > troopsB) {
            lossesA = troopsA * MapArmy.lossMeanRatio * (1 - MapArmy.lossRadius + Math.random() * 2 * MapArmy.lossRadius);
            lossesB = lossesA * (troopsA / troopsB);
        } else {
            // Otherwise, randomize both losses
            lossesA = troopsA * MapArmy.lossMeanRatio * (1 - MapArmy.lossRadius + Math.random() * 2 * MapArmy.lossRadius);
            lossesB = troopsB * MapArmy.lossMeanRatio * (1 - MapArmy.lossRadius + Math.random() * 2 * MapArmy.lossRadius);
        }

        return [troopsA - Math.ceil(lossesA * multA), troopsB - Math.ceil(lossesB * multB)];
    }

    // Simulate 1 tick of battle for an army colliding with an enemy node
    private static battleNode(node: MapNode, army: MapArmy) {
        let nodeMult = 1;
        if (node.type === MapNode.NodeType.Fort)
            nodeMult *= 0.5;
        if (army.from.team === army.team && army.from.type === MapNode.NodeType.Artillery)
            nodeMult *= 2;

        const armyMult = (node.type === MapNode.NodeType.Artillery) ? 2 : 1;

        const [newNodeTroops, newArmyTroops] = MapArmy.battle(node.troops, army.troops, nodeMult, armyMult);

        if (newNodeTroops <= 0) {
            node.type = MapNode.NodeType.Normal;
            node.assign = undefined;
            army.troops = 0;

            if (newArmyTroops > 0) {
                node.team = army.team;
                node.troops = newArmyTroops;
            } else if (newArmyTroops <= 0) {
                node.team = Player.Team.Neutral;
                node.troops = 0;
            }
        } else {
            army.troops = newArmyTroops;
            node.troops = newNodeTroops;
        }

        node.wasAttacked = true;
    }

    // Simulate 1 tick of battle between two enemy armies colliding on an edge
    private static battleEdge(army1: MapArmy, army2: MapArmy) {
        const army1Mult = (army2.from.team === army2.team && army2.from.type === MapNode.NodeType.Artillery) ? 2 : 1;
        const army2Mult = (army1.from.team === army1.team && army1.from.type === MapNode.NodeType.Artillery) ? 2 : 1;

        const [newArmy1Count, newArmy2Count] = MapArmy.battle(army1.troops, army2.troops, army1Mult, army2Mult);
        
        army1.troops = newArmy1Count;
        army2.troops = newArmy2Count;
    }

    // Update an array of armies by 1 tick
    // Returns a tuple of updated army array and an array of new armies to send
    public static tick(armies: MapArmy[]): [MapArmy[], [MapNode, MapNode, number][]] {
        const armiesToSend: [MapNode, MapNode, number][] = [];

        // Sort armies so that we can handle ones that are closer to their destinations first.
        // This way, we avoid having false collisions between armies that are travelling
        // parallel and right next to each other.
        const sortedArmies = armies.sort((a: MapArmy, b: MapArmy) => b.distance - a.distance);
        for (let army of sortedArmies) {
            const distance = MapNode.intDistance(army.from, army.to);

            if (army.distance === distance) {
                const node = army.to;

                if (army.team !== node.team) {
                    MapArmy.battleNode(node, army)
                } else {
                    node.troops += army.troops;
                    if (army.finalDest !== node)
                        armiesToSend.push([node, army.finalDest, army.troops]);
                    army.troops = 0;
                }
            } else {
                let collided = false;

                for (let otherArmy of sortedArmies) {
                    if (MapArmy.areCollidingTail(army, otherArmy)) {
                        if (army.team === otherArmy.team && army.finalDest === otherArmy.finalDest) {
                            otherArmy.troops += army.troops;
                            army.troops = 0;
                        } else {
                            MapArmy.battleEdge(army, otherArmy);
                        }
                        collided = true;
                        break;
                    } else if (MapArmy.areCollidingHead(army, otherArmy) && army.team !== otherArmy.team) {
                        MapArmy.battleEdge(army, otherArmy);
                        collided = true;
                        break;
                    }
                }

                if (!collided) army.distance++; // move forward if not blocked
            }
        }

        // Remove armies with non-positive troop counts
        const newArmies = [];
        sortedArmies.forEach(army => {
            if (army.troops > 0)
                newArmies.push(army);
        });

        return [newArmies, armiesToSend];
    }

    /*
        INSTANCE METHODS
    */
    // Convert this army to a non-recursive JSON format
    public toJSON(): MapArmy.MapArmyJSON {
        return {
            from: this.from.id,
            to: this.to.id,
            troops: this.troops,
            distance: this.distance,
            team: this.team,
            id: this.id
        }
    }

}

export default MapArmy;