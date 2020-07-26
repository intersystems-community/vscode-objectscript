---
layout: default
title: Server-side source control
permalink: /serversource/
---

# Server-side source control workflow

## Prerequisites

- The source control provider of choice is available on the IRIS or Caché server.
- No ObjectScript code is on the user’s local system.
Workflow
- VS Code is opened at a location of the user’s choice.
- User configures a VS Code workspace: story configure-server.
- User now sees server-side assets in their Explorer pane as if they were local files (by virtue of the isfs service).
- The assets shall be decorated with symbols representing their status in source control, e.g. checked out, modified, etc.
- If user attempts to edit an asset, the extension makes a request to the server, initiating a source control management flow which is unique to each product. 
- Once the server has granted editing permission, when the user saves their changes, the asset is compiled on the server. Compilation may reformat the asset according to type (classes are canonicalized, persistent classes may have storage definitions created, server-side hooks may add source). The changes are returned to the client for in-memory representation to the user.
- It is the user’s responsibility to initiate the request to submit modified files to the server-side source control system.
