# ubiquity-hackathon

# Running
```
git clone https://github.com/dfoderick/ubiquity-hackathon
cd ubiquity-hackathon
npm install
```
Note: on one machine I get an 'git' error. I am debugging it.  

Once installed, app can be run with `node src/index`. Run from root of project so that the wallet knows how to find the existing wallets. The output is shown below.

Note: Run two instances to simulate 2 peers on network.

```
C:\Users\Dave\ubiquity-hackathon>node src/index
You are Dave (d65efeab2a8e2557d1e61ec2c8ac27f6d2f4575d043a58f8afa835e64eaadf7f)
Listening to port: 3791
Subscribed to channel metanet
ubiquity$ help

  Commands:

    help [command...]   Provides help for a given command.
    exit                Exits application.
    peers               show peers
    iam <handle>        changes your handle and wallet
    @ <peer>            connect direct p2p exchange with peer seq
    send xpub           send your wallet xpub
    pay <amount> <fee>  sends payment tx to peer. peer will broadcast
    w                   show wallet utxos
    debug               debug. show payment transaction
    execute             Execute script on the payment transaction.
    broadcast           broadcast the transaction
    fact <n>            requests peer to calculate factorial
    sign                finalize and sign the transaction
    stream              starts a data stream pull with peer
    stop                stop the data stream
    validatetx          Validates Tx in mempool or a block
```

# Basic Commands
peers = will show current peers in your channel  
iam = announces your handle and switches to the wallet with that name (i.e. wallet_myhandle.json)  
@ <handle> = connect to peer with that handle (use a space after @)  
w = show wallet utxos  
d = debug. shows the current payment transaction    
x = execute. execute the scriptSig if there are pushdata opcodes  
s = sign. sign the current payment tx  
b = broadcast the current payment tx. if fails look at error meesage. There is help in /docs

Other commands that will be used in examples.  
pay <amount> <fee> = sends payment tx to peer for that amount. You can consolidate utxo by paying peer. peer should 'x' and 'b' to broadcast.  
val = pays peer to validate tx. use 'd' to show results.  
stream = start streaming. displays meter of running costs.  
stop = stops the stream. peer that started the stream will need to execute, sign and broadcast.  

# General setup for each example
|Peer1 (Satoshi)|Peer2 (Hal)|
|----|----|
|iam satoshi|iam hal|
|@ satoshi||
|w||

Make sure Satoshi has balance in wallet. If needed, fund the address with moneybutton. If neeed consolidate utxo using the `pay` command.

# Example 1: Simple cash gifting
|Peer1 (Satoshi)|Peer2 (Hal)|
|----|----|
|pay 9999 600|d (debug). Notice that there is push data in scriptSig. Transaction is validly signed.|
||x (execute script to malleate tx). Notice that any push data with a corresponding DROP has been removed. Tx is still validly signed.|
||b (broadcast)|
||w (wallet balance as increased)|
|pay 9999 600 -f 'for your eyes only'||

# Example 2: Earn BSV income as a Provider
|Peer1 (Satoshi)|Peer2 (Hal)|
|----|----|
|val|Hal will automatically execute and broadcast and send result to Satoshi|
|d (to see result)|w (to see payment in wallet)|

# Example 3: Stream micro-payments for usage metering
|Peer1 (Satoshi)|Peer2 (Hal)|
|----|----|
|stream|displays will show data stream and payment metering|
|stop||
|x (execute script)||
|s (sign)||
|b (broadcast)||
* There is bug here. Hal is supposed to be able to broadcast the last tx.