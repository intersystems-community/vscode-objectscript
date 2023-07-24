---
layout: default
title: Reporting Issues
permalink: /feedback/
nav_order: 8
---

{: .warning }
This documentation has been moved to the [InterSystems Documentation site](https://docs.intersystems.com/components/csp/docbook/DocBook.UI.Page.cls?KEY=GVSCO_reporting). This page will be removed at a later date.

# Reporting Issues

[InterSystems ObjectScript for VS Code](https://docs.intersystems.com/components/csp/docbook/DocBook.UI.Page.cls?KEY=GVSCO) consists of three collaborating VS Code extensions. This modular architecture also means there are three different GitHub repositories where issues can be created. Fortunately VS Code itself helps with the task. You will need a GitHub account. Here's how:

1. From the Help menu in VS Code choose 'Report Issue'. Alternatively, open the Command Palette and run `Help: Report Issue...`.

2. When the dialog appears, use the first dropdown to classify your issue:
    - Bug Report
    - Feature Request
    - Performance Issue

3. In the second dropdown pick 'An extension'

4. The third dropdown lets you pick one of your installed extensions. You can type a few characters to find the right entry. For example, `isls` quickly selects "InterSystems Language Server".

   Which one to choose? Here's a guide:
   - InterSystems Language Server
        - code coloring
        - Intellisense
   - InterSystems ObjectScript
        - export, import and compile
        - ObjectScript Explorer (browsing namespace contents)
        - direct server-side editing using `isfs://` folders in a workspace
        - integration with server-side source control etc
   -  InterSystems Server Manager
        - Server Browser on the InterSystems Tools view
        - password management in local keychain
        - definition and selection of entries in `intersystems.servers`

    If unsure, pick InterSystems ObjectScript.

5. Type a descriptive one-line summary of your issue. The dialog may offer a list of existing issues which could be duplicates. If you don't find one that covers yours, proceed.

6. Enter details. If your VS Code is authenticated to GitHub the dialog's button is captioned "Create on GitHub" and clicking it will open the issue, then load it in your browser so you can edit it. Otherwise it reads "Preview on GitHub" and launches a browser page where you must complete and submit your report.

   Tips for use on the GitHub page:

    - Paste images from your clipboard directly into the report field. For hard-to-describe issues an animated GIF or a short MP4 gets bonus points. The `Developer: Toggle Screencast Mode` in VS Code can help your recording make more sense.
    - Link to other issues by prefixing the target number with #
    - Remember that whatever you post here is visible to anyone on the Internet. Mask/remove confidential information. Be polite.
