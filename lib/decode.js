const Transform = require('stream').Transform
const inherits = require('inherits')
const equal = require('buffer-equal')

const PNGsignature = new Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function Decoder(opts) {
  if(!(this instanceof Decoder)) return new Decoder(opts)
  this.nread = 0
  this.signature = null
  this.buffer = new Buffer.alloc(0)
  Transform.call(this, {objectMode: true})
}
inherits(Decoder, Transform)

Decoder.prototype._transform = function _transform(chunk, enc, cb) {   
  this.buffer = Buffer.concat([this.buffer, chunk]) // performance?
  this.nread += chunk.length
  
  // parse signature
  if(!this.signature) {
    if(this.nread >= 8) {
      this.nread -= 8
      this.signature = this.buffer.slice(0, 8)
      if(equal(this.signature, PNGsignature)) {
        this.buffer = this.buffer.slice(8)
      } else {
        return cb(new Error('Not a PNG signature'))
      }
    } else {
      return cb()
    }
  } 
  
  this.afterIEND = false

  while(this.nread > 0) {
    if (this.afterIEND) {
      // after IEND chunk, it should not have any other chunks - security concern
      // It should not parse them. This could possiblly be a corrupted PNG file.
      return cb(new Error('After IEND chunk, should not have other chunks.'))
    }
    this.current = this.current || {}
    
    if(this.nread >= 4 && !('length' in this.current)) {
      this.current.length =  this.buffer.readInt32BE(0)
      if (this.current.length < 0) {
        // it is possible to have the negative length when the PNG file is corrupted
        // or when the PNG file is not a valid PNG file
        // in this case, we should stop the stream and return an error
        return cb(new Error(`Invalid PNG chunk length: ${this.current.length}`));
      }
      this.buffer = this.buffer.slice(4)
    }
    if(this.nread >= 8 && !('type' in this.current)) {
      const type = this.buffer.slice(0, 4)
      this.current.type = type.toString('ascii')
      this.buffer = this.buffer.slice(4)
    }
    if(this.nread >= 8 + this.current.length && !('data' in this.current)) {
      this.current.data = this.buffer.slice(0, this.current.length)
      this.buffer = this.buffer.slice(this.current.length)
    }

    if(this.nread >= 12 + this.current.length ) {
      this.current.crc = this.buffer.slice(0, 4)
      this.buffer = this.buffer.slice(4)
      this.nread = this.nread - 12 - this.current.length
      this.push(this.current)
    } else {
      break
    }
    // It supposes that the last chunk is IEND. The corrupted PNG file may not have IEND chunk.
    // or after the IEND chunk, there may be other chunks.
    if (this.current.type === 'IEND') {
      this.afterIEND = true
      // this.emit('end')
      // break
    }
    this.current = {}
  }
  cb()
}

Decoder.prototype._flush = function (cb) {
  cb()
}

module.exports = Decoder