// routine: routine name must be declared in a routine
const regex = /ROUTINE ([^\s]+)/i
const regexType = /ROUTINE\s+[^\s]+\s+\[.*Type=([a-z]{3,})/i

module.exports = code => {

    const arr = code.match( regex )
    const rtn = ( arr || [] )[ 1 ] || ''
    const ext = ( code.match( regexType ) || [] )[ 1 ] || 'MAC'
    return rtn + '.' + ext 

}