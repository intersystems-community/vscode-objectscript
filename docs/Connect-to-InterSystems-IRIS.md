---
layout: default
title: Connect to InterSystems IRIS
permalink: /connect/
nav_order: 2
---
# Connect to InterSystems IRIS

To be able to use many of the plugin features, you first need to configure the connection to an InterSystems IRIS or Caché server.

* Find an 'objectscript.conn' section in workspace settings by following the menu sequence File > Preferences > Settings. Do not forget to set active to true. Set port to the web port of the instance you want to connect to. By default, this is 57772 for Caché/Ensemble and 52773 for InterSystems IRIS.
  
  ```json
  {
    "objectscript.conn": {
      "active": true,
      "label": "LOCAL",
      "host": "127.0.0.1",
      "port": 52773,
      "username": "user",
      "password": "password",
      "ns": "USER",
      "https": false
    },
    "objectscript.export.folder": "src", 
    "objectscript.serverSideEditing": false
  }
  ```

*	Change settings to those appropriate to your Caché or InterSystems IRIS instance.
* You will see related output in "Output" while switched to "ObjectScript" channel (right drop-down menu on top of the output window).