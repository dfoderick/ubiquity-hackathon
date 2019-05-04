const os = require('os')
const fs = require('fs')
const EventEmitter = require('events')
const crypto = require('crypto')
const SwarmDiscovery = require('discovery-swarm')
const defaults = require('dat-swarm-defaults')
const getPort = require('get-port')
const vorpal = require('vorpal')()
const { Wallet } = require('../importedcode/wallet')

const swarm_topic = 'metanet'
const peers = {}
let connSeq = 0
let myhost = os.hostname()
let myhandle = os.userInfo().username
const wallet = new Wallet()

// Peer Identity, a random hash to identify your peer
const myId = crypto.randomBytes(32)
/** 
* Default DNS and DHT servers
* These servers are used for peer discovery and establishing connection
*/
const config = defaults({
    id: myId,
    handle: `${myhandle}`
})
whoami()

/**
* discovery-swarm library establishes a TCP p2p connection and uses
* discovery-channel library for peer discovery
*/
sw = SwarmDiscovery(config)
  
async function startSwarm () {

    // Choose a random unused port for listening TCP peer connections
    const port = await getPort()

    sw.listen(port)
    log('Listening to port: ' + port)

    /**
    * The channel we are connecting to.
    * Peers should discover other peers in this channel
    */
    sw.join(swarm_topic)
    log(`Subscribed to channel ${swarm_topic}`)

    sw.on('connection', (conn, info) => {
        const seq = connSeq

        const peerId = info.id.toString('hex')
        log(`Connected #${seq} to peer ${info.host}:${info.port} (${peerId})`)

        // Keep alive TCP connection with peer
        if (info.initiator) {
        try {
            conn.setKeepAlive(true, 600)
        } catch (exception) {
            log('exception', exception)
        }
    }

    conn.on('data', data => {
        const peer = peers[peerId]
        log(`Received message from peer ${peer.handle || peer.id } ---> ${showObject(data)}`)
        //commands received from peer will go here
        let msg = data.toString()
        if (msg.startsWith('#iam ')) {
            peer.handle = msg.replace('#iam ','')
            log(`Peer handle updated to ${peer.handle}`)
        }
    })

    conn.on('close', () => {
      log(`Connection ${seq} closed, peer id: ${peerId}`)
      // If the closing connection is the last connection with the peer, removes the peer
      if (peers[peerId].seq === seq) {
        delete peers[peerId]
      }
    })

    // Save the connection
    if (!peers[peerId]) {
      peers[peerId] = {id: peerId}
    }
    peers[peerId].conn = conn
    peers[peerId].seq = seq
    peers[peerId].host = info.host
    peers[peerId].port = info.port
    connSeq++

  })

}

startSwarm()

p2pPeer = null

//---------------------- Commands -----------------------

vorpal
  .command('peers', 'show peers')
  .action(function(args, callback) {
    listPeers()
    callback()
  })

vorpal
  .command('iam <handle>', 'changes your handle and wallet')
  .action(function(args, callback) {
    myhandle = args.handle
    broadcast(`#iam ${myhandle}`)
    vorpal.delimiter(`${args.handle}$`)
    //switch wallet
    const walletName = `wallet_${args.handle}.json`
    wallet.initialize(walletName)
    wallet.fileName = walletName
    vorpal.log(`using wallet ${walletName}`)
    callback()
  })


let commandPrompt = 'ubiquity$'
vorpal
  .delimiter(`${commandPrompt}`)
  .show()

//---------------------- Functions -----------------------

function whoami() {
  log(`You are ${myhandle} on ${myhost} (${myId.toString('hex')})`)
}

function log () {
  for (let i = 0, len = arguments.length; i < len; i++) {
    vorpal.log(arguments[i])
  }
}

function showObject(data) {
  if (typeof data == 'string' || data instanceof String) {
    return data.toString()
  } else if (data instanceof Buffer) {
    return data.toString()
  } else {
    return JSON.stringify(data)
  }
}

function listPeers() {
    for (let id in peers) {
        const listpeer = peers[id]
        const connected = p2pPeer && p2pPeer.id === id ? "@" : " "
        log(`${connected}Peer #${listpeer.seq} ${listpeer.host}:${listpeer.port} (${id})`)
    }
}

function broadcast(message) {
    let sentCount = 0
    for (let id in peers) {
        peers[id].conn.write(message)
        sentCount++
    }
    return sentCount
}
