// routine: routine name must be declared in a routine
const regex = /ROUTINE ([^\s]+)(?:\s+\[.*Type=([a-z]{3,})\])?/i

module.exports = code => {
    let [ meta, name, ext ] = code.match( regex )
    ext = ext || 'MAC'
    return { name, ext }
}
