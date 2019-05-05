# ubiquity-hackathon

Pending documents to be uploaded to /docs
- Project description
- Images of planning documents
- Ideas for future UI

Technical highlights
- Extend the reach of the bitcoin protocol into the p2p model
- direct P2P channels using datproject
- Nakamoto style payment channels
- Execute script before broadcasting a transaction
- Malleate Tx by executing script
- Push serialized transactions onto stack by embedding them into other transactions

This project requires a modified bsv library. See https://github.com/dfoderick/bsv/tree/p2p. This branch will be installed using `npm install`. See package.json file.  

# Running
```
git clone https://github.com/dfoderick/ubiquity-hackathon
cd ubiquity-hackathon
npm install
node src/index
```
Note: on one Windows machine I get an 'git' error when trying to install. I am debugging it. It must be a local issue.  

Once installed, app can be run with `node src/index`. Run from root of project so that the wallet knows how to find the existing wallets (satoshi and hal). The output is shown below.

Note: Run two instances to simulate 2 peers on network.
Note: Sometimes the 'keep-alive" fails and peer disconnects. If that happens, close both instances (with exit command) and re-run.

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
iam = announces your handle and switches to the wallet with that name (i.e. wallet_satoshi.json)  
`@ <handle>` = connect to peer with that handle (use a space after @)  
`w` = show wallet utxos  
`d` = debug. shows the current payment transaction    
`x` = execute. execute the scriptSig if there are pushdata opcodes  
`s` = sign. sign the current payment tx  
`b` = broadcast the current payment tx. if fails look at error meesage. There is help in /docs

Other commands that will be used in examples.  
`pay <amount> <fee>` = sends payment tx to peer for that amount. You can consolidate utxo by paying peer. peer should `x` and `b` to broadcast.  
`val` = pays peer to validate tx. use 'd' to show results.  
`stream` = start streaming. displays meter of running costs.  
`stop` = stops the stream. peer that started the stream will need to execute, sign and broadcast.  

# General setup for each example
After running `node src/index` you initialize a direct p2p connection using the `iam` and `@` commands as shown below.
|Peer1 (Satoshi)|Peer2 (Hal)|
|----|----|
|iam satoshi|iam hal|
|@ hal||
|w||

Peers will exchange public keys.

Make sure Satoshi has balance in wallet. If needed, fund the address with moneybutton. If need, consolidate utxos using the `pay` command.

The following examples might be safe to run in order, without resetting the app. The app only keeps track of one payment transaction (shown with the `d` command)

# Example 1: Simple cash gifting with private messaging
This example is provided as "tongue in cheek". Satoshi was the original Bitcoin onboarder who sent 10 Bitcoin to Hal Finney. Note the use of scriptSig malleation.

|Peer1 (Satoshi)|Peer2 (Hal)|
|----|----|
|pay 9999 600 -f 'for your eyes only'|d (debug). Notice that there is push data in scriptSig. Transaction is validly signed.|
||x (execute script to malleate tx). Notice that any push data with a corresponding DROP has been removed. Tx is still validly signed.|
||b (broadcast)|
||w (wallet balance as increased)|

# Example 2: Earn BSV income as a Provider
In the early days of mining a user could leave their computer hashing at hight and wake up the next morning with some Bitcoin to spend. It was a simple method of onboarding new users using proof of work. We resurrect that idea below. 
Providers get paid by performing specialized calculations. They would leave their computer on and when someone uses it for a calculation then they get paid. Note the use of pushing a serialized transaction onto the stack in this example.

Calculation ideas.
 - Transaction validation
 - Gaming server
 - Smart contract autonomous agent
 - Other specialty scientific computing

|Peer1 (Satoshi)|Peer2 (Hal)|
|----|----|
|val|Hal will get the serialized tx from the stack, validate the tx, broadcast the payment and send the result (true/false) to Satoshi|
|d (to see result)|w (to see payment in wallet)|

# Example 3: Stream micro-payments for usage metering
This example uses a micro payment channel for metering data usage. It does not actually show a video stream. The important thing to see how Hal's balance goes up while Satoshis decreases. It could be used for people who agree to watch a video in exchange for BSV. Earn money while browing the internet, clicking on adds, filling out product surveys, live streaming of events. Anything with metered usage.

|Peer1 (Satoshi)|Peer2 (Hal)|
|----|----|
|stream|display will show data stream and payment metering|
|stop| x (execute script)|
|| b (broadcast)|

* Bug Fixed. Hal is supposed to be able to broadcast the last tx since the `stop` command was signed by Satoshi. If Hall cannot broadcast then Satoshi can execute, sign and broadcast.