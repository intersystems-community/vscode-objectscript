const fs = require( 'fs' )
const path = require( 'path' ), sep = path.sep
// work like linux 'mkdir -p' command
module.exports = dirpath => {

    dirpath.split( sep ).reduce( ( currentPath, folder ) => {

        currentPath += folder + sep

        if ( !fs.existsSync( currentPath ) ){
            fs.mkdirSync( currentPath )
        }

        return currentPath

    }, '' )

}