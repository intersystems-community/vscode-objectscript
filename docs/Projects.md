---
layout: default
title: Working with Projects
permalink: /projects/
nav_order: 9
---

{: .warning }
This documentation has been moved to the [InterSystems Documentation site](https://docs.intersystems.com/components/csp/docbook/DocBook.UI.Page.cls?KEY=GVSCO_project). This page will be removed at a later date.

# Working with Projects

A project is a named set of class definitions, routines, include files, web application files or custom documents. All files in a project must be in the same namespace on the same InterSystems server. Each document can be associated with any number of projects. Each namespace can contain any number of projects.

## Why Projects?

You are not required to use projects in VS Code, but you should consider using them if:

* You work [server-side](../serverside) and the `type` and `filter` [query parameters](../serverside/#filters-and-display-options) are not granular enough.
* You work server-side and want to edit CSP and non-CSP files in the same workspace folder.
* You work client-side and want to group together many files to export with a single click.
* You are migrating from InterSystems Studio and want to keep using an existing project.

{: #explorer}
## Projects Explorer

The easiest way to manage projects is using the Projects Explorer, which is in the [ObjectScript view](../extensionui/#objectscript-view):

![Projects Explorer](../assets/images/projects-explorer.png "projects explorer")

Initally, the Projects explorer contains a root node for each server and namespace connection that exists for the current workspace. It can be expanded to show all projects in that namespace on the server, and expanding the project node will show its contents:

![Projects Explorer Expanded](../assets/images/projects-explorer-expanded.png "projects explorer expanded")

You can also add root nodes for namespaces on any server configured using the InterSystems Server Manager extension. To do so, click on the plus (`+`) button at the top of the view.

The following sections will describe how to use the Projects Explorer and other tools to work with projects.

{: #creating}
## Creating Projects

There are two ways to create projects in VS Code:

* Right-click on a server-namespace node in the Projects Explorer and select the `Create Project` menu option.
* Open the command palette and run the `ObjectScript: Create Project` command.

Project names are required to be unique per server-namespace and may optionally have a description. The description is shown when hovering over the project's node in the Projects Explorer or below its name when selecting one in a dropdown menu.

{: #modifying}
## Modifying Projects

There are three ways to add or remove items from a project:

* Using the Projects Explorer:
  * To add items, right-click on the project node or one of the document type nodes (i.e. `Classes` or `Routines`) and select the `Add Items to Project...` menu option. If you clicked on a document type node, you will only be shown documents of that type to add.
  * To remove an item, right-click on its node and select the `Remove from Project` menu option. If you remove a package or directory node, all of its children will also be removed from the project. You may also right-click on the project node and select the `Remove Items from Project...` menu option to be presented with a multi-select dropdown that allows you to remove multiple items at once.
* Within a workspace folder configured to view or edit documents in a project directly on the server:
  * To add items, right-click a root `isfs(-readonly)` folder that has the `project` query parameter in its URI and select the `Add Items to Project...` menu option.
  * To remove an item, right-click on its node and select the `Remove from Project` menu option. If you remove a package or directory node, all of its children will also be removed from the project. You may also right-click on a root `isfs(-readonly)` folder that has the `project` query parameter in its URI and select the `Remove Items from Project...` menu option to be presented with a multi-select dropdown that allows you to remove multiple items at once.
* Using commands:

  Open the command palette and select the `ObjectScript: Add Items to Project...` or `ObjectScript: Remove Items from Project...` command.

### Add to Project UI

The `Add to Project` command implements a custom multi-select dropdown that is shown regardless of how it is invoked. Items that are in the namespace and not already in the project are shown. The elements of this UI are described in more detail below:

![Add to Project UI](../assets/images/add-to-project.png "add to project UI")

* Title bar row:
  * Click the icons to show or hide system and generated items, respectively.
* Input box row:
  * Click the check box to select all items that are currently shown.
  * Type in the input box to filter the items that are shown.
  * Click the **OK** button to add the selected items to the project.
* Item rows:
  * Click the check box to select the item. If the item is a package or CSP directory, all of its contents will be selected as well, even though the check boxes for those items don't appear selected.
  * The icon preceding the name represents its type. It corresponds to the icons in the Projects Explorer and [ObjectScript Explorer](../extensionui/#objectscript-view).
  * The more prominent text is the short name of the item, as it would appear in a file system.
  * The less prominent text is the full name of the item, including its package or CSP directory.
  * Click the arrow icon at the far right of the row to show or hide its contents.

{: #deleting}
## Deleting Projects

There are two ways to delete projects in VS Code:

* Right-click on a project node in the Projects Explorer and select the `Delete Project` menu option.
* Open the command palette and run the `ObjectScript: Delete Project` command.

{: #server-side}
## Editing Project Contents Server-Side

There are a few methods to create a workspace folder to view or edit documents in a project directly on the server:

* Follow the steps [here](../serverside/#config-server-side) and select the project.
* Right-click in the [Explorer view](../extensionui/#explorer-view) and select the `Add Server Namespace to Workspace` menu option.
* Use the InterSystems Tools view, as described [here](../extensionui/#viewing-and-editing-source-code-on-the-server).
* Right-click on a project node in the [Projects Explorer](../projects/#explorer) and select the `Add Workspace Folder For Project` menu option.
* Add a folder to your `.code-workspace` file directly:
```json
{
  "uri": "isfs://myserver:user/?project=prjname",
  "name": "prjname"
}
```

{: #client-side}
## Editing Project Contents Client-Side

The entire contents of the project can be easily exported to your local file system for client-side editing. To do so, simply right-click on the project you'd like to export and select the `Export Project Contents` menu option.

## Notes

If you are getting `ERROR #5540: SQLCODE: -99 Message: User abc is not privileged for the operation` when you try to expand the Projects Explorer or view a project's contents in a virtual folder, then grant user abc (or a SQL role they hold) the following SQL permissions:

```SQL
GRANT SELECT, INSERT, UPDATE, DELETE ON %Studio.Project, %Studio.ProjectItem TO abc
GRANT EXECUTE ON %Studio.Project_ProjectItemsList TO abc
```
