import socketio = require('socket.io');

import Game from './Game';
import Player from './Player';
import MapNode from './Map/MapNode';

/*
    Room:
    Class which represents a collection of sockets (players) interacting with one Game of riskystrats
*/
class Room {

    /*
        STATIC PROPERTIES
    */
    private static roomCount = 0;                                       // Number of rooms generated since server started (used to assign rooms IDs)
    private static tickDuration = 500;                                  // Amount of milliseconds for each tick of gameplay
    
    /*
        INSTANCE PROPERTIES
    */
    public id: string;                                                  // Unique identifier for this room
    public game: Game | undefined = undefined;                          // The game being played in this room
    public isLaunched: boolean = false;                                 // Denotes whether the game has launched
    public isRunning: boolean = false;                                  // Denotes whether the game is currently simulating ticks
    public players: Player[] = [];                                      // Array of players in this game
    public spectators: Player[] = [];                                   // Array of spectators in this game
    public name: string;                                                // Name of Room
    public key: string | undefined;                                     // Key to access this Room if it is private
    public stopHandler: () => void = () => {};                          // Handler to fire when this Room stops

    private tickInterval: NodeJS.Timeout | undefined = undefined;

    /*
        CONSTRUCTOR
    */
    public constructor(
        private readonly io: socketio.Server,                           // SocketIO server
        public readonly maxPlayers: number = 6,                         // Maximum number of players
        public readonly isPrivate: boolean = false                      // Determines if the Room should be accessed through the public list or a room key
    ) {
        const index = Room.roomCount++;

        this.id = `room_${index}`;
        this.name = `Room ${index}`;

        if (isPrivate) {
            this.key = '';
            for (let i = 0; i < 4; ++i) {
                this.key += ('QWERTYUIOPASDFGHJKLZXCVBNM')[Math.floor(Math.random() * 26)];
            }
        }

        console.log(`New room ${this.id} has been created!`);
    }

    /*
        INSTANCE METHODS
    */
    // Add a player to the Room
    public addPlayer(player: Player) {
        player.socket.join(this.id);

        if (this.isLaunched || this.isRunning || this.game !== undefined || this.players.length >= this.maxPlayers) {
            this.spectators.push(player);
            player.team = Player.Team.Neutral;

            console.log(`Player ${player.id} has joined room ${this.id} as a player!`);
        } else {
            this.players.push(player);
            player.team = this.players.length;

            player.attachHandler('startRoom', this.id, () => {
                if (this.players.length > 0 && player === this.players[0]) {
                    this.startRoom();
                    this.runGame();
                }
            });

            player.attachHandler('runGame', this.id, () => {
                if (this.players.length > 0 && player === this.players[0])
                    this.runGame();
            })

            player.attachHandler('pauseGame', this.id, () => {
                if (this.players.length > 0 && player === this.players[0])
                    this.pauseGame();
            })

            console.log(`Player ${player.id} has joined room ${this.id} as a spectator!`);
        }

        this.emitRoomData();
    }

    // Remove a player from the Room
    public removePlayer(player: Player) {
        if (this.players.includes(player)) {
            // Remove from player list and room
            this.players.splice(this.players.indexOf(player), 1);
            player.socket.leave(this.id);
            player.socket.emit('roomData', JSON.stringify(undefined));

            // Remove nodes in game and reset team
            if (this.game !== undefined)
                this.game.forfeit(player.team);
            player.team = Player.Team.Neutral;

            // Detach handleers
            player.detachHandler('build', this.id);
            player.detachHandler('sendArmy', this.id);
            player.detachHandler('assign', this.id);
            player.detachHandler('startRoom', this.id);
            player.detachHandler('runGame', this.id);
            player.detachHandler('pauseGame', this.id);

            if (this.players.length === 0) {
                this.stopRoom();
            }

            this.emitRoomData();

            console.log(`Player ${player.id} has stopped playing in room ${this.id}!`);
        } else if (this.spectators.includes(player)) {
            // Remove from spectator list and room
            this.spectators = this.spectators.splice(this.spectators.indexOf(player), 1);
            player.socket.leave(this.id);
            player.socket.emit('roomData', JSON.stringify(undefined));

            this.emitRoomData();

            console.log(`Player ${player.id} has stopped spectating in room ${this.id}!`);
        }
    }

    // Exit lobby status and generate a game with the current players
    public startRoom() {
        if (this.isLaunched || this.game !== undefined)
            return;

        this.game = new Game(this.players.length);
        this.isLaunched = true;

        console.log(`Room ${this.id} has started!`);
    }

    // Stop the game, resetting all players and removing assets of the game
    public stopRoom() {
        if (!this.isLaunched)
            return;

        if (this.isRunning)
            this.pauseGame();

        delete this.game;
        this.game = undefined;
        this.isLaunched = false;

        for (let player of this.players) {
            this.removePlayer(player);
        }
        for (let spectator of this.spectators) {
            this.removePlayer(spectator);
        }

        this.stopHandler();

        console.log(`Room ${this.id} has stopped!`);
    }

    // Start simulating ticks of the Game
    public runGame() {
        if (this.game === undefined || !this.isLaunched || this.isRunning)
            return;

        // Attach player event handlers
        for (let player of this.players) {
            // Build on node
            player.attachHandler('build', this.id, (nodeID: number, type: MapNode.NodeType) => {
                const node = this.game.getNodeByID(nodeID);
                if (node !== undefined && this.game.build(player.team, node, type))
                    this.emitRoomData();
            });

            // Send army between two nodes
            player.attachHandler('sendArmy', this.id, (fromNodeID: number, toNodeID: number, troops: number) => {
                const fromNode = this.game.getNodeByID(fromNodeID);
                const toNode = this.game.getNodeByID(toNodeID);
                if (fromNode === undefined || toNode === undefined) return;

                if (this.game.sendArmy(player.team, fromNode, toNode, troops))
                    this.emitRoomData();
            });

            // Assign/unassign node to another node
            player.attachHandler('assign', this.id, (fromNodeID: number, toNodeID: number) => {
                const fromNode = this.game.getNodeByID(fromNodeID);
                if (fromNode === undefined) return;

                if (toNodeID < 0) {
                    if (this.game.unassign(player.team, fromNode))
                        this.emitRoomData();
                    return;
                }

                const toNode = this.game.getNodeByID(toNodeID);
                if (toNode === undefined) return;

                if (this.game.assign(player.team, fromNode, toNode))
                    this.emitRoomData();
            });
        }

        // Set interval for game simulation
        this.tickInterval = setInterval(() => {
            this.game.tick();
            this.emitRoomData();
        }, Room.tickDuration);

        this.isRunning = true;
        
        console.log(`Room ${this.id} has started running!`);
    }

    // Stop simulating ticks of the Game
    public pauseGame() {
        if (this.game === undefined || !this.isLaunched || !this.isRunning || this.tickInterval === undefined)
            return;

        // Detach player event handlers
        for (let player of this.players) {
            player.detachHandler('build', this.id);
            player.detachHandler('sendArmy', this.id);
            player.detachHandler('assign', this.id);
        }
        
        // Stop interval
        clearInterval(this.tickInterval);
        this.tickInterval = undefined;

        this.isRunning = false;

        console.log(`Room ${this.id} has been paused!`);
    }

    // Send the JSON string of all room data to client sockets
    public emitRoomData() {
        this.io.in(this.id).emit('roomData', JSON.stringify(this.toJSON()));
    }

    // Convert this Room to a JSON structure
    public toJSON(): Room.RoomJSON {
        return {
            players: this.players.map(player => player.toJSON()),
            spectators: this.spectators.map(spectator => spectator.toJSON()),
            game: (this.game !== undefined) ? this.game.toJSON() : undefined,
            summary: this.roomSummaryJSON()
        };
    }

    // Create a short JSON summary of this room
    public roomSummaryJSON(): Room.RoomSummaryJSON {
        return {
            name: this.name,
            id: this.id,
            nPlayers: this.players.length,
            maxPlayers: this.maxPlayers,
            nSpectators: this.spectators.length
        };
    }

}

/*
    RoomJSON:
    JSON interface for Room class
*/
namespace Room {
    export interface RoomJSON {
        players: Player.PlayerJSON[],
        spectators: Player.PlayerJSON[],
        game: Game.GameJSON | undefined,
        summary: RoomSummaryJSON
    }

    export interface RoomSummaryJSON {
        name: string,
        id: string,
        nPlayers: number,
        maxPlayers: number,
        nSpectators: number
    }
}

export default Room;