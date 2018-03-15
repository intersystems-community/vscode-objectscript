const {sep} = require('path')
//for example: 'mypkg.subpkg.myclass.cls'
// return 'mypkg/subpkg/'
module.exports = docname => {

    const parts = docname.split( '.' ) // [ 'mypkg', 'subpkg', 'myclass', 'cls' ]
    const packagesEnd = parts.length - 2 // name and extension
    return [
        parts.slice( 0, packagesEnd ).join( sep ), // packages to subfolders
        parts.slice( packagesEnd ).join( '.' )
    ].join( sep ) 

}