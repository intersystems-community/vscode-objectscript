---
layout: default
title: Client-Side source control
permalink: /clientsource/
---

# Client-Side source control workflow

## Prerequisites

- The source control provider of choice is available on the client system, preferably installed as an extension into visual studio code.
- The sources exist on the client file system and are in UDL format.
- No further assumptions about the nature of the source control system are assumed. It is the user’s responsibility to manage their sources. Automatic check-out, check-in or other source control functions will not be performed by our extension. 
Workflow
- Reference story “install-full”
- Reference story “workspace”
- Reference story “configure-basic”
- Populate the VS Code workspace with code assets in UDL format. If the source control system (SCS) requires checkout (not all do), it’s the user’s responsibility to perform that action. If this is the case, then the UI should not allow editing until the file is checked out.
  - User chooses ObjectScript: Explorer pane to browse assets: story objectscript-explorer
  - From the ObjectScript:Explorer pane, assets may be transferred from the server to the client workspace by right-clicking on an asset (for a single asset) or a folder (for all assets in that folder) and choosing “export”. The assets are persisted on the local client in UDL format at the location specified in the configuration setting: objectscript.export.folder.
- Edit files that exist in your open VS Code workspace. These are “client files”.
  - Client files have a file system path relative to the workspace displayed in the breadcrumb header
  - When saved, VS Code attempts to import the code from the client into the target namespace and compile on the server.
  - If compilation fails, the user is presented with an error message.
  - If compilation succeeds, the server will canonicalize the source code, incorporate any server generated changes and will write them back to the file in the workspace. 
- User submits modified files to their client-side source control system.
