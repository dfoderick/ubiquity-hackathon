// wallet functions
// generate private key
// create multisig address
// broadcast tx
// pay to moneybutton account
// create moneybutton account for recipient

//const utils = require('./utils')
const bsv = require('bsv')
const fs = require('fs')
const vorpal = require('vorpal')()
const bitcoinsource = require('bitcoinsource')
const Insight = require('bitcoin-source-api')

class Wallet {
    constructor() {
        this.walletFileName = 'wallet.json'
        // TODO: dust limit on bsv should be about 400 sat
        this.dustLimit = 550
    }

    get fileName() {
        return this.walletFileName
    }
    set fileName(value) {
        this.walletFileName = value
    }

    get contents() {
        return this.walletContents
    }

    get privateKey() {
        return this.wifToXPriv(this.walletContents.wif)
    }

    wifToXPriv(wif) {
        return bsv.PrivateKey.fromString(wif).toHex()
    }

    get scriptPubKey() {
        if (!this.walletContents) {
            return ''
        }
        return bsv.Script.buildPublicKeyHashOut(this.walletContents.address)
    }

    //example wallet.json
    // {
    //     "wif":"private key",
    //     "address": "optional address in legacy format"
    // }
    generate(key) {
        let pk = null;
        if (key !== null && key !== undefined && key !== '') {
            pk = bsv.PrivateKey(key)
        } else {
            pk = bsv.PrivateKey()
        }
        const address = new bsv.Address(pk.publicKey, bsv.Networks.mainnet)
        console.log(`generated wallet with address ${address}`)

        const wallet = {
            "wif": pk.toWIF(),
            "xpub": pk.publicKey.toString(),
            "address": address.toString()
        }
        return this.store(wallet)
    }

    store(wallet) {
        const sWallet = JSON.stringify(wallet, null, 2);
        this.backup()
        fs.writeFileSync(this.walletFileName, sWallet, 'utf8', function(err) {
            if(err) {
                console.log(err)
                return
            }
        });
        return wallet
    }

    backup() {
        if (fs.existsSync(this.walletFileName)) {
            let timestamp = (new Date()).toISOString()
            .replace(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}).(\d{3})Z$/, '$1$2$3.$4$5$6.$7000000');
            fs.renameSync(this.walletFileName, `${this.walletFileName}.${timestamp}`)
        }
    }

    // create a wallet if there is not already one
    initialize(filename) {
        if (filename) {
            this.walletFileName = filename
        }
        if (!fs.existsSync(this.walletFileName)) {
            this.generate()
        }
        this.walletContents = require(`../${this.walletFileName}`)
    }

    getApi() {
        return Insight.create('bsv')
    }

    async getBalance(address) {
        const api = this.getApi()
        const addrObj = new bitcoinsource.Address(address || this.walletContents.address)
        const bal = await api.getBalance(addrObj)
        return bal
    }

    async getUtxos(address) {
        const api = this.getApi()
        const addrObj = new bitcoinsource.Address(address || this.walletContents.address)
        return api.getUtxos(addrObj)
    }

    filterUtxos(utxos, amount) {
        const result = []
        let sum = 0
        for (var u of utxos) {
            if (sum < amount) {
                result.push(u)
                sum += u.satoshis
            }
        }
        return result
    }

    sumUtxos(utxos) {
        let sum = 0
        for (var u of utxos) {
            sum += u.satoshis
        }
        return sum
    }

    // make a tx from us
    async makeTransactionTo(toAddress, amount, fee) {
        //don't add all the utoxs, just add enough to cover the amount
        const utxos = await this.getUtxos(this.walletContents.address)
        let tx = new bsv.Transaction()
            .from(this.filterUtxos(utxos, amount + (fee || this.dustLimit)))
            .to(toAddress, amount)
            .change(this.walletContents.address)
        if (fee && fee > 0) {
            tx = tx.fee(fee)
        }
        tx.sign(this.privateKey)
        return tx
    }

    makeTransactionToUs(amount) {
        const tx = new bsv.Transaction()
            .to(this.walletContents.address, amount)
        return tx
    }

    sign(tx) {
        tx.sign(this.privateKey)
        return tx
    }

    show() {
        if (!this.walletContents) {
            vorpal.log(`wallet not loaded yet. use 'iam' command to annouce yourself first.`)
        } else {
            vorpal.log(`address ${this.walletContents.address}`)
            vorpal.log(`xpub ${this.walletContents.xpub}`)
            vorpal.log(`scriptPubKey ${this.scriptPubKey.toString()}`)
            vorpal.log(`scriptPubKey ${this.scriptPubKey.toHex()}`)
            //get balance
            const api = this.getApi()
            const addrObj = new bitcoinsource.Address(this.walletContents.address)
            ; (async () => {
                const bal = await api.getBalance(addrObj)
                vorpal.log(`Balance ${bal}`)
            })()
            ; (async () => {
                const utxos = await api.getUtxos(addrObj)
                for (let x = 0; x < utxos.length; x++) {
                vorpal.log(`Utxo${x} ${JSON.stringify(utxos[x])}`)
            }
            })()
        }
    }

    async broadcast(tx) {
        if (!tx) {
            vorpal.log(`No transaction to broadcast!`)
            return null
        }
        if (tx.getFee() > 1500) {
            vorpal.log(`Fee ${tx.getFee()} is too much!`)
            return null
        }
        try {
            //can be exception here is tx has negative fee, for example
            const txsend = new bitcoinsource.Transaction(tx.serialize())
            const api = this.getApi()
            const result = await api.sendTransaction(txsend)
            return result
        } catch (ex) {
            vorpal.log(ex)
        }
        return null
    }

}

module.exports = { Wallet }
