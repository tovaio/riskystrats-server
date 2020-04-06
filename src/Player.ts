import socketio = require('socket.io');

/*
    Player:
    Wrapper for a client socket
*/
class Player {

    /*
        STATIC PROPERTIES
    */
    public static playerCount = 0;                                                          // Number of players created since the start
    
    public static playerEvents = [                                                          // Array of events that the client can send (excluding disconnect)
        'build',
        'sendArmy',
        'assign',
        'createRoom',
        'joinRoom',
        'leaveRoom',
        'startRoom',
        'runGame',
        'pauseGame'
    ];

    /*
        INSTANCE PROPERTIES
    */
    private _team: Player.Team = Player.Team.Neutral;                                       // Team this player is representing in a Game
    public name: string;                                                                    // Username of this player
    public readonly id: number;                                                             // Unique identifier of this player
    public isConnected: boolean;                                                            // Denotes whether the player socket is connected

    private handlers: Record<string, Record<string, (...payload: any[]) => void>> = {};     // Hashmap of functions to fire when the client sends an event

    // Get _team
    public get team(): Player.Team {
        return this._team;
    }

    // Set _team
    public set team(newTeam: Player.Team) {
        this._team = newTeam;
        this.emitPlayerData();
    }

    /*
        CONSTRUCTOR
    */
    public constructor(
        //private readonly server: socketio.Server,                                         // SocketIO server this player is connected to
        public readonly socket: socketio.Socket                                             // Socket which this player is connected through
    ) {
        this.id = Player.playerCount++;
        this.name = `Player ${this.id}`;
        this.isConnected = socket.connected;

        // Allow client to change username
        socket.on('changeName', (newName: string) => {
            this.name = newName;
            this.emitPlayerData();
        });

        // Mark as not connected when disconnected and fire handlers
        socket.on('disconnect', () => {
            this.isConnected = false;

            for (let key in this.handlers['disconnect']) {
                this.handlers['disconnect'][key]();
            }
        });

        // Run appropriate handlers when client event fires
        for (let event of Player.playerEvents) {
            socket.on(event, (...payload: any[]) => {
                for (let key in this.handlers[event]) {
                    this.handlers[event][key](...payload);
                }
            });
        }

        // Send player data to client
        this.emitPlayerData();
        
        console.log(`New player ${this.name} has connected!`)!
    }

    /*
        INSTANCE METHODS
    */

    // Add a handler to be fired when this Player sends an event
    public attachHandler(event: string, key: string, handler: (...payload: any[]) => void) {
        if (!Player.playerEvents.includes(event) && event !== 'disconnect')
            throw new Error(`${event} is not a valid client event`);
        
        if (!(event in this.handlers))
            this.handlers[event] = {};
        
        this.handlers[event][key] = handler;
    }

    // Remove a handler from being fired when this Player sends an event
    public detachHandler(event: string, key: string) {
        if (!Player.playerEvents.includes(event) && event !== 'disconnect')
            throw new Error(`Event ${event} is not a valid client event`);
        if ((event in this.handlers) && (key in this.handlers[event]))
            delete this.handlers[event][key];
    }

    // Sends player data to client
    public emitPlayerData() {
        this.socket.emit('playerData', JSON.stringify(this.toJSON()));
    }

    // Convert this Player instance into a JSON object
    public toJSON(): Player.PlayerJSON {
        return {
            team: this.team,
            name: this.name,
            id: this.id
        };
    }

}

/*
    PlayerJSON:
    JSON interface for Player class

    PlayerID:
    Possible teams for players
*/
namespace Player {
    export interface PlayerJSON {
        team: Player.Team,
        name: string,
        id: number
    }
    
    export enum Team {
        Neutral,
        Red,
        Blue,
        Green,
        Yellow,
        Orange,
        Purple
    }
}

export default Player;