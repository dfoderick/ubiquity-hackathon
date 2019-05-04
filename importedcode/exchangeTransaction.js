const bsv = require('bsv')
var Interpreter = bsv.Script.Interpreter

// A transaction that is passed between peers in an exchange.
// Contains multiple outputs of various types
// # starts a command
// 010 starts a serialized tx
// any other OP_RETURN else is a simple text message
// other outputs are P2PKH or P2SH
class ExchangeTransaction {
    constructor(wallet, transaction) {
        this.wallet = wallet
        //address that we want to be paid to
        this.toaddress = ''
        this.fromaddress = ''
        if (transaction) {
            this.transaction = transaction
        } else {
            this.transaction = new bsv.Transaction()
        }
    }

    get fromAddress() {
        return this.fromaddress
    }
    set fromAddress(value) {
        this.fromaddress = value
    }

    get toAddress() {
        return this.toaddress
    }
    set toAddress(value) {
        this.toaddress = value
    }

    getTransaction() {
        return this.transaction
    }

    finalize() {
        // for(let x = 0; x < this.transaction.inputs.length; x++) {
        //     const txin = this.transaction.inputs[x]
        //     //enable this check when bsv is fixed
        //     //if (!txin.isFinal()) {
        //         txin.sequenceNumber = 0xffffffff
        //     //}
        // }
    }

    getLastOutputOfType(type) {
        if (this.transaction.outputs.length === 0 ) {
            return ''
        }
        for (let x = this.transaction.outputs.length - 1; x >= 0; x--) {
            const output = this.getOutput(x)
            if (this.getOutputType(output) === type) {
                return output
            }
        }
        return ''
    }

    //gets the last command
    getCommand() {
        if (this.transaction.inputs.length > 0) {
            // TODO: if tx is not signed yet then command is in dataScript and has not been prepended to script yet!
            const input = this.transaction.inputs[0]
            let inputScript = input.script.getNextScriptSection(false)
            // hacky
            if (inputScript.chunks.length === 0) {
                inputScript = input.getDataScript()
                if (!inputScript) {
                    return ''
                }
            }
            // more hacks
            for (let x = 0; x < inputScript.chunks.length; x++) {
                let op = inputScript.chunks[x]
                //TODO: check if it is pushdata
                if (!op.buf) {
                    return ''
                }
                return Buffer.from(op.buf).toString()
            }
        }
        return null
    }

    getMessage() {
        const o = this.getLastOutputOfType('message')
        if (o) {
            return o.script.getData().toString()
        }
        return null
    }

    getResult() {
        return this.outputToString(this.getLastOutputOfType('result'))
    }

    outputToString(o) {
        if (o) {
            return o.script.getData().toString()
        }
        return null
    }

    //gets an ouput with payment amount
    getPayment() {
        return this.getLastOutputOfType('payment')
    }

    //gets the raw serialized tx, caller needs to make the tx object with JSON.parse(extx.getSerialized())
    getSerialized() {
        return this.outputToString(this.getLastOutputOfType('serialized'))
    }

    getOutputType(o) {
        if (!o || !o.script) {
            return 'message'
        }
        if (o.satoshis > 0) {
            return 'payment'
        }
        const s = o.script.getData().toString()
        if (s.startsWith('#')) {
            return 'command'
        }
        if (s.startsWith('{"hash":')) {
            return 'serialized'
        }
        if (s.startsWith('result:')) {
            return 'result'
        }
        return 'message'
    }

    getOutput(n) {
       return this.transaction.outputs[n]
    }

    addData(data) {
        this.transaction.addData(data)
    }

    addCommand(message, tx) {
        // add command to tx
        // add to input sigscript
        if (this.transaction.inputs.length === 0) {
            throw "Transaction has no inputs to add Command!"
        }
        if (this.transaction.inputs.length > 0) {
            let dataScript = bsv.Script()
            dataScript.add(Buffer.from(message))
            dataScript.add('OP_DROP')
            dataScript.add('OP_CODESEPARATOR')
            // signing loses the script. setting setDataScript is the fix
            this.transaction.inputs[0].setDataScript(dataScript)
            // dataScript will not get moved into script until input is signed!
        }
        if (tx) {
            this.addTransaction(tx)
        }
    }

    addSerialized(tx) {
        //add serialized tx to output
        //if tx needs to be signed by other side then do not serialize into hex, use json instead
        //this.addData(tx.uncheckedSerialize())
        this.addData(JSON.stringify(tx.toJSON()))
    }

    paymentTo(address) {
        //get payment from serialized output?
        //sum outputs to an address
        let amount = 0
        if (this.transaction.outputs.length === 0 ) {
            return amount
        }
        const toScript = bsv.Script.buildPublicKeyHashOut(this.toAddress).toString()
        for (let x = 0; x < this.transaction.outputs.length ; x++) {
            if (this.transaction.outputs[x].script == toScript) {
                amount += this.transaction.outputs[x].satoshis
            }
        }
        return amount
    }

    getFromOutput() {
        let fromOut = null
        const fromScript = bsv.Script.buildPublicKeyHashOut(this.fromAddress).toHex()
        for (let x = 0; x < this.transaction.outputs.length ; x++) {
            if (this.transaction.outputs[x].script == fromScript) {
                return this.transaction.outputs[x]
            }
        }
        return fromOut
    }

    getFromAmount() {
        if (this.fromAddress) {
            let fromOut = this.getFromOutput()
            if (fromOut) {
                return fromOut.satoshis
            }            
        }
        return 0
    }

    //pass amount in satoshis
    pay(amount) {
        if (this.fromAddress) {
            let fromOut = this.getFromOutput()
            if (fromOut) {
                fromOut.satoshis -= amount
            }
        }
        let to = null
        const toScript = bsv.Script.buildPublicKeyHashOut(this.toAddress).toString()
        for (let x = 0; x < this.transaction.outputs.length ; x++) {
            if (this.transaction.outputs[x].script == toScript) {
                to = this.transaction.outputs[x]
                to.satoshis += amount
                break
            }
        }
        if (!to) {
            // invariant: payment must exceed dust limit
            this.transaction.to(this.toAddress, this.getDustAmount() + amount)
        }
    }

    getDustAmount() {
        return Math.max(this.wallet.dustLimit, bsv.Transaction.DUST_AMOUNT)
    }

    getInputAmount() {
        let amountIn = 0
        for(let x = 0; x < this.transaction.inputs.length; x++) {
            amountIn += this.transaction.inputs[x].output.satoshis
        }
        return amountIn
    }

    //refund balance back to payer
    addRefundOutput() {
        console.log(`adding refund`)
        if (this.fromAddress) {
            const inAmount = this.getInputAmount()
            const charge = this.paymentTo(this.toAddress)
            let fromAmount = this.getFromAmount()
            let refundAmount = inAmount - charge - this.getDustAmount()
            console.log(`refund ${refundAmount}`)
            if (refundAmount > 0)
            {
                let fromOut = this.getFromOutput()
                if (!fromOut) {
                    this.transaction.to(this.fromAddress, refundAmount)
                } else {
                    fromOut.satoshis = refundAmount
                }
            }
        } else {
            console.log(`no refund address`)
        }
    }

    trimReturns() {
        for (let x = this.transaction.outputs.length - 1; x >= 0; x--) {
            const output = this.getOutput(x)
            const outputType = this.getOutputType(output)
            if (outputType === 'command' || outputType === 'message') {
                this.transaction.removeOutput(x)
            }
        }
    }

    // execute the sigScript
    execute() {
        if (this.transaction 
          && this.transaction.inputs.length > 0
          && this.transaction.inputs[0].getDataScript()) {
            const si = new Interpreter()
            const scriptEval = this.transaction.inputs[0].script.getNextScriptSection(true)
            if (!scriptEval.isPublicKeyHashIn() && !scriptEval.isScriptHashOut()) {
                const verified = si.verify(scriptEval, bsv.Script(''))
                // if stack is empty for this section then remove that section of script
                if (!verified && si.stack.length === 0) {
                    if (si.errstr === 'SCRIPT_ERR_EVAL_FALSE_NO_RESULT') {
                        console.log(`to delete: ${scriptEval.toString()}`)
                        this.transaction.inputs[0].script.findAndDelete(scriptEval)
                        this.transaction.inputs[0].setDataScript(null)
                        console.log(`data script removed. tx malleated.`)
                    }
                } else {
                    //remove op_codeseparator?
                }
            }
        } else {
            this.log(`cannot execute transaction`)
        }
    }

}

module.exports = { ExchangeTransaction }
