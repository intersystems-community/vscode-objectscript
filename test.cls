/// Export different types of modules in different subfolders in UDL (plain) format
/// test.dfi -> /dfi/test.dfi
/// testpkg.test.cls -> /cls/testpkg/test.cls
Class sc.code [ Abstract ] {

/// export all available code
ClassMethod export(generated = 0, system = 0, percent = 0, mapped = 0) {

	#define export(%code, %file) ##continue
			s sc = $system.OBJ.ExportUDL(%code, %file,"/diffexport")  ##continue
			w +sc ##continue
			if 'sc d $system.OBJ.DisplayError(sc)

	#define isGenerated(%code) ##class(%RoutineMgr).IsGenerated( %code )
	#define isPercented(%code) ("%" = $e(%code))
	#define isMapped(%code) ##class(%RoutineMgr).IsMapped( %code )
	#define log w !, code, " -> ", filename, " "

	#define mkdir(%filename) ##continue
                s path = ##class(%File).GetDirectory( %filename ) ##continue
                if '##class(%File).DirectoryExists( path ) { ##continue
                        s sc = ##class(%File).CreateDirectoryChain( path ) ##continue
                        w !, "mkdir ", path, " ", sc ##continue
                }



	#; classes
	s rs = ##class(%ResultSet).%New("%Dictionary.ClassDefinition:Summary")
	if rs.Execute() {

		while rs.%Next(){

			s code = rs.Name _ ".cls", isSystem = rs.System
			if ( 'system && isSystem ) continue
			if ( 'generated && $$$isGenerated( code ) ) continue
			if ( 'percent && $$$isPercented( code ) ) continue
			if ( 'mapped && $$$isMapped( code ) ) continue
			s filename = ..filename( code )
			$$$mkdir( filename )
			$$$log
			$$$export( code, filename )

		} s rs=""
	}

	#; routines
	s rs = ##class(%ResultSet).%New("%Routine:RoutineList")
	if rs.Execute() {

    	while rs.%Next() {

	 		s code = rs.Name
	 		if ( 'generated && $$$isGenerated( code ) ) continue
	 		if ( 'percent && $$$isPercented( code ) ) continue
			if ( 'mapped && $$$isMapped( code ) ) continue

			s filename = ..filename( code )
			$$$mkdir( filename )
			$$$log
			$$$export( code, filename )

	    } s rs=""
	}


	#; dfi
	#define export(%code,%file) w ##class(%DeepSee.UserLibrary.Utils).%Export( %code, %file, 0 )
	s sql = "Select fullName as Name From %DeepSee_UserLibrary.FolderItem"
        s rs = ##class(%SQL.Statement).%ExecDirect( .stm, sql )
        while rs.%Next() {
		s code = rs.Name, filename = ..filename( code_".dfi" )
		$$$mkdir( filename )
		$$$log
		$$$export(code,filename)

	} s rs=""

    Q 1
}

/// import all from workdir
ClassMethod import(filemask = "*.*", qspec = "cku-d", ByRef err = "", recurse = 1, ByRef loaded = "", verbose = 1) As %Status {
	#define push(%dir) s dirs( $i( dirs ) ) = %dir
	#define next(%i,%dir) s %i=$o( dirs( "" ), 1, %dir )  k:%i'="" dirs(%i)
	#define isDirectory(%type) ( %type = "D" )
	#define log w !, filename, " ", +sc, $S(sc=1:"",1: " "_$system.Status.GetOneErrorText(sc))
	
	s sc = 1, dirs = "", dir = ..workdir() $$$push(dir)

	for { $$$next(i,dir) Q:i=""  Q:dir=""

		s rs = ##class(%File).FileSetFunc( dir, filemask, , 1 )

		while rs.%Next() {
			s filename = rs.Name

			if $$$isDirectory(rs.Type) {
				if recurse $$$push(filename)
				continue
			}

			s ext = $p( filename, ".", * )

			if $zcvt( ext, "l" ) = "dfi" {
				s sc = ##class(%DeepSee.UserLibrary.Utils).%Import( filename, 1, 0, 0, "", .loaded )
			} else {
				s sc = $system.OBJ.Load( filename, qspec, .err, .loaded)
			}

			if verbose $$$log

	    }
	}

	Q sc
}

/// get or set working directory for export/import source
ClassMethod workdir(workdir) {
	s gln = ..gln() s:$d(workdir) @gln = workdir
	///zu(12) namespace directory by default
	#define nsdir $zu(12,"")
	Q $g(@gln, $$$nsdir)
}

/// gl[obal] n[ame] - storage for settings
ClassMethod gln() [ CodeMode = expression, Private ] {
"^"_$classname()
}

/// test.dfi -> /dfi/test.dfi
/// test.cls -> /cls/test.cls
/// testpkg.test.cls -> /cls/testpkg/test.cls
/// etc
ClassMethod filename(code) {
	#define log(%dir,%sc) w !, "mkdir ", %dir, " ", sc

	s wd = ..workdir()

	if '##class(%File).DirectoryExists( wd ) {
		s sc = ##class(%File).CreateDirectoryChain( wd )
		$$$log(wd,sc)
	}

	s ext = $p( code, ".", * ), ext = $zcvt( ext, "l" )
	#; for each type - different directory

	s:ext'="" wd = ##class(%File).NormalizeDirectory( ext, wd )

	#; directory must exist before any call (%File).NormalizeFilename( , wd)
	if '##class(%File).DirectoryExists( wd ) {
		s sc = ##class(%File).CreateDirectoryChain( wd )
		$$$log(wd,sc)
	}

	s filename = ##class(%File).NormalizeFilename( code, wd )
	//B:code="DPRep.Rest.JSON.cls" "L"
	#; for *.cls Package.Subpackage.ClassName.cls -> Folder/Subfolder/ClassName.cls
	if ext ="cls" {
		s dirs = $piece( code, ".",1, *-2 ), dirs = $translate( dirs, ".", "/" )
		s relpath = dirs _ "/" _ $piece( code, ".", *-1, * ) ;
		s filename = ##class(%File).NormalizeFilename( relpath, wd )
	}
	Q filename
}

/// import from workdir all files with ts newer than code ts in db
ClassMethod importUpdated(filemask = "*.*", qspec = "cku-d", ByRef err = "", recurse = 1, ByRef loaded = "", verbose = 1) As %Status {
	#define push(%dir) s dirs( $i( dirs ) ) = %dir
	#define next(%i,%dir) s %i=$o( dirs( "" ), 1, %dir )  k:%i'="" dirs(%i)
	#define isDirectory(%type) ( %type = "D" )
	#define log w !, filename, " -> ", codename, " ", +sc
	s sc = 1, dirs = "", dir = ..workdir() $$$push(dir)
	for { $$$next(i,dir) Q:i=""  Q:dir=""

		s rs = ##class(%File).FileSetFunc( dir, filemask, , 1 )

		while rs.%Next() {
		   s filename = rs.Name

		   if $$$isDirectory( rs.Type ) {
			 if ( recurse ) $$$push(filename) ;push directory
			 continue
		   }

		   s filets = rs.DateModified
		   s codename = ..codename( filename, .ext )
		   s codets = ..codets( codename, ext )
		   if ( filets '] codets ) continue
			 //w codename,! B "L"

		   /*
		   w !, " ************* import ************** "
		   w !, "file: ", filets
		   w !, "code: ", codets
		   */

		   if ext = "dfi" {

			   s sc = ##class(%DeepSee.UserLibrary.Utils).%Import( filename, 1, 0, 0, "", .loaded )

		   } else {

			   #; drop existing code before import ( purge DateModified )
			   s:codets'="" sc = ##class(%RoutineMgr).Delete( codename )
			   s sc = $system.OBJ.Load( filename, qspec, .err, .loaded)

		   }

		   if verbose $$$log
	    }
	}
	Q sc
}

/// presumable codename
ClassMethod codename(filename, ByRef ext = "") {
	s ext = $p( filename, ".", * ), ext = $zcvt( ext, "l" )
	s path = ##class(%File).NormalizeDirectory( ext, ..workdir() )
	s codename = $p( filename, path, 2 )
	if ext = "dfi" {
		s fullname  = $tr( codename, "\", "/" ) ; return fullname for dfi in $$$IsWINDOWS
		Q $p( fullname, ".", 1, *-1 ) ;remove extension
	}
	if (ext ="cls")!(ext="int")!(ext="inc")!(ext="mac") s codename=$tr(codename,"/",".")
	Q codename
}

ClassMethod codets(codename, ext) {
	s ts = ""
	if ext'="dfi" {
		s ts = ##class(%RoutineMgr).TS( codename )
	} else {
		s sql="Select timeModified From %DeepSee_UserLibrary.FolderItem Where fullname = ?"
		s rs = ##class(%SQL.Statement).%ExecDirect( , sql, codename )
		if rs.%Next() {
			s utcts = rs.timeModified
			s utch = $zdth( utcts, 3, , 3 ) ;utc internal format
			s loch = $zdth( utch, -3 ) ; utc to local timezone
			s ts = $zdt( loch, 3, ,0 ) ; local timestamp*/
		}
	}
	Q $p( ts, "." ) ;remove ms
}

}