---
layout: default
title: InterSystems Extensions UI
permalink: /extensionui/
nav_order: 3
---
# InterSystems Extensions User Interface

The InterSystems extensions add additional capability to the VS Code user interface to support development in ObjectScript. These additions are based on the standard VS Code UI, which is described in the section [User Interface](https://code.visualstudio.com/docs/getstarted/userinterface) in the VS Code documentation.

## Explorer View

Select the Explorer view button in the Activity Bar to open the view.

![Explorer view button.](../assets/images/explorer.png "explorer view button")

The Explorer view is a standard VS Code view. InterSystems extensions add the following items to context menus in the this view:

- **Add Server Namespace to Workspace...** - in context menu of folders
- **Import and Compile** - in context menu of folders and files
- **Import Without Compilation** - in context menu of folders and files

## InterSystems Tools View

The InterSystems Server Manager extension supplies an InterSystems Tools view. Select the InterSystems Tools view button in the Activity Bar to open the view.

![InterSystems Tools button.](../assets/images/intersystems-tools.png "intersystems tools button")

### Viewing Server Resources

This view shows server resources in a tree format.

![Server tree view.](../assets/images/server-tree-view.png "server tree view")

As you can see, the view groups servers into a variety of folders, such as currently in use, favorites, and recently used. Within the view, you can perform operations on the servers. When you move the cursor over a server listing, you see controls to mark the server as a favorite, and open the management portal for the server in either the simple browser in a VS Code tab, or an external browser:

- ![Add to starred.](../assets/images/add-to-starred.png "add to starred")
- ![Open management portal in tab.](../assets/images/management-portal-tab.png "open management portal the simple browser in VS Code")
- ![Open management portal in browser.](../assets/images/management-portal-browser.png "open management portal in browser")

Notes About the VS Code Simple Browser

Only one Simple Browser tab can be open at a time, so launching a second server's Management Portal replaces the previous one.

If the server version is InterSystems IRIS 2020.1.1 or later you need to change a setting on the suite of web applications that implement Management Portal. The Simple Browser is not be permitted to store the Portal's session management cookies, so the Portal must be willing to fall back to using the CSPCHD query parameter mechanism.

In the management portal, select **System Administration > Security > Applications > Web Applications**. Enter `/csp/sys` in the **filter** field to find the five web applications whose path begins with `/csp/sys`.

![Portal web app list.](../assets/images/five-web-apps.png "portal web app list")

For each application, select the link in the **name** column to edit the application definition. In the section labeled **Session Settings**, change the the value of **Use Cookie for Session** from **Always** to **Autodetect**. 

![Edit session setting.](../assets/images/edit-webapp.png "edit session setting")

Save the change. This change is not thought to have any adverse effects on the usage of Portal from ordinary browsers, which continue to use session cookies.

### Viewing and Editing Source Code on the Server

Expand the target server, then expand its **Namespaces**  folder. Hover over the target namespace to reveal its command buttons:

![Namespace edit buttons.](../assets/images/namespace-buttons.png "namespace edit buttons")

- Click the **edit pencil** button to add an isfs://server:namespace/ folder to your VS Code workspace.
- Click the **viewing eye** button to add an isfs-readonly://server:namespace/ folder to your VS Code workspace.
- Hold the **alt** or **option** key while clicking the edit or view button if you want to add a folder that gives you access to server-side web application files (for example, CSP files).

Once you have added a server-side namespace to the workspace, VS Code opens the Explorer view showing the added namespace. The following screen shot shows the **Sample** and **User** packages in the **src** folder on the client, and the **Sample** and **User** packages in the **USER** namespace on the server, with read-only access.

![Client-side and server-side namespaces.](../assets/images/client-server.png "client-side and server-side namespaces")

Learn more about isfs and isfs-readonly folders in the section [Configuration for Server-side Editing](../serverside).

If you are already doing client-side editing of your code, for example, managing it with Git, be sure you understand the consequences of also doing server-side editing using isfs. The ObjectScript extension's README outlines the differences between client-side and server-side editing. If in doubt, limit yourself to isfs-readonly by only using the eye icon.

### Adding a Server

You can use the plus sign (`+`) at the top of the view to add a server. This control provides an additional entry point to the process described in the section [Configuring a Server](../configuration/#config-server).

![Add server.](../assets/images/add-server.png "add server")

The server definition is added to your user-level *settings.json* file and also appears at the top of the 'Recent' folder.

### Server Context Menu

Servers listed in the InterSystems Tools view provide a context menu which provides access to several commands, including storing and clearing passwords in the keychain.

![Server context menu.](../assets/images/server-context-menu.png "server context menu")

A submenu enables you to set the color of the icon to the left of the server name. The following screen shot shows this menu, and the icon color set to red.

![Set icon color.](../assets/images/set-icon-color.png "set icon color")

### Import Server Connections

On Windows, the Server Manager can create connection entries for all connections you previously defined with the original Windows app called InterSystems Server Manager. This action is available from the '...' menu at the top right corner of Server Manager's tree, as shown in the following screen shot.

![Import servers from registry.](../assets/images/import-servers.png "import servers from registry")

## ObjectScript View

The InterSystems ObjectScript extension supplies an ObjectScript view container. The button to select this appears in the Activity Bar only when a folder or a workspace that includes a client-side folder is open:

![ObjectScript button.](../assets/images/objectscript.png "objectscript button")

When a VS Code workspace is not connected to an InterSystems IRIS server, the ObjectScript view provides a button that lets you select a server and namespace. Once the workspace is connected to an InterSystems IRIS server, the ObjectScript view shows files on the server, grouped by type of file.

If the workspace is configured for server-side editing, the ObjectScript view is not available. In this configuration, the Explorer view lists files on the server, not on the local machine, making the ObjectScript view irrelevant.

The ObjectScript view provides the following items:

- **Compile** - Compiles files on the server.
- **Delete** - Deletes files from the server.
- **Export** - Exports files to the workspace on the client.
- **Server Command Menu...** - Pick a command from menus configured on the server.
- **Server Source Control...** - Pick a command from menus configured on the server.

The InterSystems IRIS documentation section [Extending Studio](https://docs.intersystems.com/irislatest/csp/docbook/Doc.View.cls?KEY=ASC#ASC_Hooks_extending_studio ) describes how to configure menus for source code control and other purposes. Entries from menus named **%SourceMenu** and **%SourceContext** appear in the **Server Source Control...** quickpick provided the source control class doesn't disable the entry, for example, disabling checkout if it knows that the file is already checked out.

Entries from menus with any other name appear in the **Server Command Menu...**.

## Views and View Containers

Technically the 'InterSystems Tools' and 'Explorer' entities described above are what VS Code calls [view containers](https://code.visualstudio.com/api/extension-capabilities/extending-workbench#view-container). Each contains a single view:
- in container **InterSystems Tools** is view **Servers**
- in container **ObjectScript** is view **Explorer**

When a VS Code container has only a single view in it the view header merges with the container header, with the two names separated by a colon.

Views can be dragged between containers, so for example you could move Explorer off its ObjectScript container and onto the InterSystems Tools container. Or move Servers onto the ObjectScript container. Or move either of them onto VS Code's main Explorer container.
