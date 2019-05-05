const os = require('os')
const fs = require('fs')
const EventEmitter = require('events')
const crypto = require('crypto')
const SwarmDiscovery = require('discovery-swarm')
const defaults = require('dat-swarm-defaults')
const getPort = require('get-port')
const vorpal = require('vorpal')()
const bsv = require('bsv')
const { Wallet } = require('../importedcode/wallet')
const { ExchangeTransaction } = require('../importedcode/exchangeTransaction')

const swarm_topic = 'metanet'
//list of all peers
const peers = {}
//the peer we are connected to
let peer = null
//connection sequence number
let connSeq = 0
//our alias name on the p2p network
let myhandle = os.userInfo().username
const wallet = new Wallet()
// the payment tx exchanged between peers
let payment = null

function setPeer(p) {
    peer = p
}

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

    let packetNumber = 1
    function stream (terminator = false) {
        if (terminator) {
            clearTimeout(timeOutVar);
        } else {
            if (payment) {
                let packetData = `Packet Data #${packetNumber}`
                packetNumber += 1
                //increment payment
                //cannot set from address here because peer is not defined?
                //payment.fromAddress = peer.address
                payment.toAddress = wallet.walletContents.address
                payment.pay(10)
                console.log(`Payment $ ${payment.paymentTo(wallet.walletContents.address)} for ${packetData}`)
                //TODO: use different method name
                payment.addCommand(packetData)
                sendExchangeTransaction(payment)
                //need to remove the data that was pushed
                payment.execute()
            }
            timeOutVar = setTimeout(function(){stream();}, 1000);
        }
    }

    conn.on('data', data => {
        //TODO: I think this is a bug!!! Makes it seem last peer to connect is always the direct peer?
        //use setPeer to set the correct peer at module level
        const peer = peers[peerId]
        // log(`Received message from peer ${peer.handle || peer.id } ---> ${showObject(data)}`)
        //commands received from peer will go here. data can be string object or tx json
        let msg = data.toString()
        const extx = getTransactionFromData(data.toString())
        if (extx) {
            payment = extx
            payment.fromAddress = peer.address
            payment.toAddress = wallet.walletContents.address
            msg = payment.getCommand()
            if (msg && !msg.startsWith('#')) {
                log(`Payment $ ${payment.paymentTo(wallet.walletContents.address)} for ${msg}`)
            } else {
                log(`Payment $ ${payment.paymentTo(wallet.walletContents.address)}`)
            }
        }
        //peer has changed their handle
        if (msg.startsWith('#iam ')) {
            peer.handle = msg.replace('#iam ','')
            log(`Peer handle updated to ${peer.handle}`)
        }
        //peer has broadcast public key and address
        if (msg.startsWith('#xpub ')) {
          const payload = msg.replace('#xpub ','').split(' ')
          peer.xpub = payload[0]
          if (payload.length > 0) {
            peer.address = payload[1]
          }
          log(`Peer xpub is now ${peer.xpub} @ address ${peer.address}`)
        }
        //peer is hailing us
        if (msg.startsWith('#@ ')) {
          const requestedPeer = msg.replace('#@ ','')
          p2ppeer = Object.values(peers).find(p => p.handle && p.handle === requestedPeer)
          if (p2ppeer) {
            setPeer(p2ppeer)
            log(`Connected to peer ${p2ppeer.handle || p2ppeer.id}`)
            sendpeer(p2ppeer, `#xpub ${wallet.walletContents.xpub} ${wallet.walletContents.address}`)
          } else {
            log(`Unknown peer handle ${requestedPeer}`)
          }
        }
        //peer has requested that we calculate factorial
        if (msg.startsWith('#factorial ')) {
            extx.fromAddress = peer.address
            extx.toAddress = wallet.walletContents.address
            //get n, compute factorial, send back result
            const num = parseInt(msg.replace('#factorial ',''), 10)
            //to execute on our end, then we charge peer iteration
            let result = 1
            if (num === 0) return 1
            for (cnt = 1; cnt <= num; cnt++) {
                result *= cnt
                const loopDescription = `factorial of ${cnt} is ${result}`
                vorpal.log(loopDescription)
                extx.addData(loopDescription)
                extx.pay(10)
            }
            extx.addData(`result:${result}`)
            log(`result ${result}`)
            //send result back to caller
            //execute the script so that command is removed. avoids infinite loop
            extx.execute()
            sendExchangeTransaction(extx)
        }
        if (msg.startsWith('#stream')) {
            // start a loop that will stream data to peer
            payment.execute()
            stream()
        }
        if (msg.startsWith('#stop')) {
            // end the loop
            stream(true)
            extx.execute()
            sendExchangeTransaction(extx)
        }
        if (msg.startsWith('#val')) {
            console.log(`validate function`)
            const valtx = new bsv.Transaction(Buffer.from(extx.getTransaction().inputs[0].script.chunks[2].buf).toString())
            // TODO: this is placeholder for validation function. it would validate that
            // tx is in a block or mempool
            let validationResult = true
            if (valtx.hash.substr(-1) < '9') {
                validationResult = false
            }
            extx.execute()
            //broadcast tx
            broadcastExchangeTransaction(extx)
            //send result to peer
            var clone = extx.clone()
            clone.addData(`result:${validationResult}`)
            sendExchangeTransaction(clone)
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

vorpal
  .command('@ <peer>', 'connect direct p2p exchange with peer seq')
  .action(function(args, callback) {
    const handle = args.peer
    peer = Object.values(peers).find(p => p.handle && p.handle === handle)
    if (peer) {
        sendpeer(peer, `#@ ${myhandle}`)
        sendpeer(peer, `#xpub ${wallet.walletContents.xpub} ${wallet.walletContents.address}`)
        let peerPrompt = peer.handle || peer.id
        const newPrompt = `${myhandle}<->${peerPrompt}$` 
        vorpal.delimiter(newPrompt)
        vorpal.ui.refresh()
        vorpal.ui.redraw.done()
    } else {
      vorpal.log(`Could not connect to peer ${args.peer}`)
    }
    callback()
  })


vorpal
  .command('send xpub', 'send your wallet xpub')
  .action(function(args, callback) {
    sendpeer(peer, `#xpub ${wallet.walletContents.xpub} ${wallet.walletContents.address}`)
    log(`sent xpub to ${peer.handle || peer.id}`)
    callback()
  })

vorpal
  .command('pay <amount> <fee>', 'sends payment tx to peer. peer will broadcast')
  .option('-f, --fyeo <private>', 'a private message to peer. For Your Eyes Only')
//  .option('-p, --public <public>', 'public data that will recorded to blockchain')
  .action(function(args, callback) {
    if (!peer) {
      console.error(`You have no peer`)
    } else {
      if (!peer.xpub) {
        console.error(`Your peer has not sent public Key`)
      } else {
        ; (async () => {
          const bal = await wallet.getBalance()
          if (bal < args.amount) {
            console.error(`Your wallet balance is too low to send that amount`)
          } else {
            ; (async () => {
                const paymenttx = await wallet.makeTransactionTo(peer.address, args.amount, args.fee )
                payment = new ExchangeTransaction(wallet, paymenttx)
                //TODO add custom message instead
                // payment.addCommand('#payment')
                payment.addPrivatePublic(args.options.fyeo, args.options.public)
                sendExchangeTransaction(payment)
            })()
          }
        })()
      }
    }
    callback()
  })

vorpal
  .command('w', 'show wallet utxos')
  .action(function(args, callback) {
      vorpal.log(`handle ${myhandle}`)
      wallet.show()
    callback()
  })

vorpal
  .command('debug', 'debug. show payment transaction')
  .alias('d')
  .action(function(args, callback) {
    if (payment) {
        showTransaction(payment.getTransaction())
    } else {
        log(`no payment`)
    }
    callback()
  })

vorpal
  .command('execute', 'Execute script on the payment transaction.')
  .alias('x')
  .action(function(args, callback) {
    if (payment) {
      payment.execute()
      showTransaction(payment.getTransaction())
    } else {
        log(`no payment`)
    }
    callback()
  })

vorpal
  .command('broadcast', 'broadcast the transaction')
  .alias('b')
  .action(function(args, callback) {
    if (payment) {
        ; (async () => {
            log(await wallet.broadcast(payment.getTransaction()))
        })()
    } else {
        log(`no payment`)
    }
    callback()
  })

  vorpal
  .command('fact <n>', 'requests peer to calculate factorial')
  .action(function(args, callback) {
    if (!peer) {
      console.error(`You have no peer`)
    } else {
      if (!peer.xpub) {
        console.error(`Your peer has not sent public Key`)
      } else {
        let amount = 600
        ; (async () => {
          const bal = await wallet.getBalance()
          if (bal < amount) {
            console.error(`Your wallet balance is too low to send that amount`)
          } else {
            ; (async () => {
                const paymenttx = await wallet.makeTransactionTo(peer.address, amount, 600)
                payment = new ExchangeTransaction(wallet, paymenttx)
                payment.addCommand(`#factorial ${args.n}`)
                sendExchangeTransaction(payment)
            })()
          }
        })()
      }
    }
    callback()
  })

vorpal
  .command('sign', 'finalize and sign the transaction')
  .alias('s')
  .action(function(args, callback) {
    if (payment) {
        payment.trimReturns()
        wallet.sign(payment.getTransaction())
    } else {
        log(`no payment`)
    }
    callback()
  })

vorpal
  .command('stream', 'starts a data stream pull with peer')
  .action(function(args, callback) {
    if (!peer) {
      console.error(`You have no peer`)
    } else {
      if (!peer.xpub) {
        console.error(`Your peer has not sent public Key`)
      } else {
        ; (async () => {
          const bal = await wallet.getBalance()
          let amount = 600
          if (bal < amount) {
            console.error(`Your wallet balance is too low to send that amount`)
          } else {
            ; (async () => {
                const paymenttx = await wallet.makeTransactionTo(peer.address, amount, 600)
                payment = new ExchangeTransaction(wallet, paymenttx)
                payment.addCommand(`#stream`)
                sendExchangeTransaction(payment)
            })()
          }
        })()
      }
    }
    callback()
  })

vorpal
  .command('stop', 'stop the data stream')
  .action(function(args, callback) {
    if (payment) {
        payment.addCommand('#stop')
        sendExchangeTransaction(payment)
    } else {
        log(`no payment`)
    }
    callback()
  })

  vorpal
  .command('validatetx', 'Validates Tx in mempool or a block')
  .alias('val')
  .action(function(args, callback) {
    if (!peer) {
      console.error(`You have no peer`)
    } else {
      if (!peer.xpub) {
        console.error(`Your peer has not sent public Key`)
      } else {
        let amount = 600
        ; (async () => {
          const bal = await wallet.getBalance()
          if (bal < amount) {
            console.error(`Your wallet balance is too low to send that amount`)
          } else {
            ; (async () => {
                const paymenttx = await wallet.makeTransactionTo(peer.address, amount, 600)
                const dummytx = await wallet.makeTransactionTo(peer.address, 2, 1)
                payment = new ExchangeTransaction(wallet, paymenttx)
                payment.addInputData([`#val`, dummytx.uncheckedSerialize()])
                sendExchangeTransaction(payment)
            })()
          }
        })()
      }
    }
    callback()
  })

let commandPrompt = 'ubiquity$'
vorpal
  .delimiter(`${commandPrompt}`)
  .show()

//---------------------- Functions -----------------------

function whoami() {
  log(`You are ${myhandle} (${myId.toString('hex')})`)
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
        const connected = peer && peer.id === id ? "@" : " "
        log(`${connected}Peer #${listpeer.seq} ${listpeer.handle} ${listpeer.host}:${listpeer.port} (${id}) ${listpeer.xpub}`)
    }
}

function sendpeer(peer, message) {
    if (peer) {
        peer.conn.write(message)
    } else {
        log(`No peer connection!`)
    }
}

function broadcast(message) {
    let sentCount = 0
    for (let id in peers) {
        sendpeer(peers[id], message)
        sentCount++
    }
    return sentCount
}

function sendExchangeTransaction(extx) {
    if (peer) {
        const tx = extx.getTransaction()
        try {
            const sent = JSON.stringify(tx.toJSON())
            peer.conn.write(sent)
            return sent
        }
        catch (ex) {
            log(tx)
            log(ex)
        }
    } else {
        console.log(`sendExchangeTransaction but there is no peer`)
    }
    return null
}

function getTransactionFromData(data) {
    //if message begins with '#' then we know it is not a transaction
    if ((typeof data == 'string' || data instanceof String) && !data.startsWith('#')) {
        try {
            let dat = data
            if (data.startsWith('{"')) {
                dat = JSON.parse(data)
            }
            return new ExchangeTransaction(wallet, new bsv.Transaction(dat))
        }
        catch (ex) {
            console.error(`Error exchange: ${data}`)
            console.error(`${ex}`)
        }
    }
    return null
}

function showTransaction(tx) {
    try {
        if (tx) {
            const bytes = tx.toString().length
            log(`----------`)
            log(`Id:${tx.id} Len:${bytes} Signed?:${tx.isFullySigned()}`)
            let amountIn = 0
            for(let x = 0; x < tx.inputs.length; x++) {
                const txin = tx.inputs[x] 
                amountIn += txin.output.satoshis
                log(`IN[${x}]: [${txin.isFullySigned() ? 'signed' : 'unsigned'}/${txin.isFinal()? 'final' : 'inprogress'}] ${txin.output.satoshis} Data=[${txin.getDataScript()}] Script=[${txin.script}] `)
            }
            let amountOut = 0
            let amountChange = 0
            for(let x = 0; x < tx.outputs.length; x++) {
                const o = tx.outputs[x]
                if (o.script == wallet.scriptPubKey.toString()) {
                    amountChange += o.satoshis
                    log(`CHG[${x}]: ${o.satoshis} pay to ${myhandle}`)
                } else {
                    amountOut += o.satoshis
                    log(`OUT[${x}]: ${o.satoshis} ${o.script.isDataOut() ? o.script.getData() : o.script.inspect() }`)
                }
            }
            const fee = amountIn - (amountOut + amountChange)
            log(`Summary: Len:${bytes} In[${tx.inputs.length}]=${amountIn} Out[${tx.outputs.length}] ${amountOut} Chg:${amountChange} Fee: ${fee} (${(fee/bytes).toFixed(2)} sat/bytes)`)
        } else {
            log(`No tx ${name}`)
        }
    }
    catch (ex) {
        log(tx)
        log(ex)
    }
}

function broadcastExchangeTransaction(extx) {
    try {
        if (extx) {
            ; (async () => {
                log(await wallet.broadcast(extx.getTransaction()))
            })()
        } else {
            log(`no payment`)
        }
    }
    catch (ex) {
        log(ex)
    }

}