---
layout: forward
target: https://docs.intersystems.com/components/csp/docbook/DocBook.UI.Page.cls?KEY=GVSCO
time: 4

title: InterSystems Extensions UI
permalink: /extensionui/
nav_order: 3
---

{: .warning }
This documentation has been moved to the [InterSystems Documentation site](https://docs.intersystems.com/components/csp/docbook/DocBook.UI.Page.cls?KEY=GVSCO_ui). This page will be removed soon.

# InterSystems Extensions User Interface

The InterSystems extensions add additional capability to the VS Code user interface to support development in ObjectScript. These additions are based on the standard VS Code UI, which is described in the section [User Interface](https://code.visualstudio.com/docs/getstarted/userinterface) in the VS Code documentation.

## Explorer View

Select the Explorer view button in the Activity Bar to open the view.

![Explorer view button.](../assets/images/explorer.png "explorer view button")

The Explorer view is a standard VS Code view. InterSystems extensions add the following items to context menus in the this view:

- **Add Server Namespace to Workspace...** - in context menu of folders
- **Import and Compile** - in context menu of folders and files when you are connected to an InterSystems server
- **Import Without Compilation** - in context menu of folders and files when you are connected to an InterSystems server

{: #intersystems-tools-view}
## InterSystems Tools View

The InterSystems Server Manager extension supplies an InterSystems Tools view. Select the InterSystems Tools view button in the Activity Bar to open the view.

![InterSystems Tools button.](../assets/images/intersystems-tools.png "intersystems tools button")

### Viewing Server Resources

This view shows server resources in a tree format.

![Server tree view.](../assets/images/server-tree-view.png "server tree view")

As you can see, the view groups servers into a variety of folders, such as currently in use, favorites, and recently used. Within the view, you can perform operations on the servers. When you move the cursor over a server listing, command buttons appear which let you mark the server as a favorite, or open the Management Portal for the server in either the simple browser in a VS Code tab or in an external browser:

- ![Add to starred.](../assets/images/add-to-starred.png "add to starred")
- ![Open Management Portal in tab.](../assets/images/management-portal-tab.png "open management portal in the simple browser in VS Code")
- ![Open Management Portal in browser.](../assets/images/management-portal-browser.png "open management portal in browser")

#### Notes About the VS Code Simple Browser

Only one Simple Browser tab can be open at a time, so launching a second server's Management Portal replaces the previous one.

If the server version is InterSystems IRIS 2020.1.1 or later you need to change a setting on the suite of web applications that implement Management Portal. The Simple Browser is not be permitted to store the Portal's session management cookies, so the Portal must be willing to fall back to using the CSPCHD query parameter mechanism.

In Management Portal, select **System Administration > Security > Applications > Web Applications**. Enter `/csp/sys` in the **filter** field to find the five web applications whose path begins with `/csp/sys`.

![Portal web app list.](../assets/images/five-web-apps.png "portal web app list")

For each application, select the link in the **name** column to edit the application definition. In the section labeled **Session Settings**, change the the value of **Use Cookie for Session** from **Always** to **Autodetect**. 

![Edit session setting.](../assets/images/edit-webapp.png "edit session setting")

Save the change. This change is not thought to have any adverse effects on the usage of Portal from ordinary browsers, which continue to use session cookies.

### Viewing and Editing Source Code on the Server

Expand the target server, then expand its **Namespaces** folder. Hover over the target namespace to reveal its command buttons:

![Namespace edit buttons.](../assets/images/namespace-buttons.png "namespace edit buttons")

- Click the **edit pencil** button to add an *isfs://server:namespace/* folder to your VS Code workspace.
- Click the **viewing eye** button to add an *isfs-readonly://server:namespace/* folder to your VS Code workspace.
- Hold the **alt** or **option** key while clicking the edit or view button to add a folder that gives you access to server-side web application files (for example, CSP files).

If you want to add a folder that shows only a single project's contents, expand the target namespace and the **Projects** folder to reveal the projects in the target namespace. Hover over the target project to reveal its command buttons:

![Project edit buttons.](../assets/images/project-buttons.png "project edit buttons")

- Click the **edit pencil** button to add an *isfs://server:namespace/?project=prjname* folder to your VS Code workspace.
- Click the **viewing eye** button to add an *isfs-readonly://server:namespace/?project=prjname* folder to your VS Code workspace.

Once you have added a server-side namespace to the workspace, VS Code opens the Explorer view showing the added namespace. The following screen shot shows the **Sample** and **User** packages in the **src** folder on the client, and the **Sample** and **User** packages in the **USER** namespace on the server, with read-only access.

![Client-side and server-side namespaces.](../assets/images/client-server.png "client-side and server-side namespaces")

Learn more about isfs and isfs-readonly folders in the section [Configuration for Server-side Editing](../serverside).

If you are already doing client-side editing of your code, for example, managing it with Git, be sure you understand the consequences of also doing server-side editing using isfs. The ObjectScript extension's README outlines the differences between client-side and server-side editing. If in doubt, limit yourself to isfs-readonly by only using the eye icon.

### Adding a Server

You can use the plus sign (`+`) at the top of the view to add a server as described in the section [Configuring a Server](../configuration/#config-server).

{: #server-context-menu}
### Server Context Menu

Servers listed in the InterSystems Tools view provide a context menu which provides access to several commands, including storing and clearing passwords in the keychain.

![Server context menu.](../assets/images/server-context-menu.png "server context menu")

A submenu enables you to set the color of the icon to the left of the server name. The following screen shot shows this menu, and the icon color set to red.

![Set icon color.](../assets/images/set-icon-color.png "set icon color")

### Import Server Connections

On Windows, the Server Manager can create connection entries for all connections you previously defined with the original Windows app called InterSystems Server Manager. This action is available from the '...' menu at the top right corner of Server Manager's tree, as shown in the following screen shot.

![Import servers from registry.](../assets/images/import-servers.png "import servers from registry")

## ObjectScript View

The InterSystems ObjectScript extension supplies an ObjectScript view container. The button to select this appears in the Activity Bar:

![ObjectScript button.](../assets/images/objectscript.png "objectscript button")

This view container contains two views: the ObjectScript Explorer and the Projects Explorer. For more information about the Projects Explorer, see the [Working with Projects](../projects/#explorer) page.

When a VS Code workspace is not connected to an InterSystems IRIS server, the ObjectScript Explorer provides a button that lets you select a server and namespace. Once the workspace is connected to an InterSystems IRIS server, the ObjectScript Explorer shows files on the server, grouped by type of file.

If the workspace is configured for server-side editing, the ObjectScript Explorer is not available. In this configuration, the Explorer view lists files on the server, not on the local machine, making the ObjectScript view irrelevant.

The ObjectScript Explorer provides the following items:

- **Compile** - Compiles files on the server.
- **Delete** - Deletes files from the server.
- **Export** - Exports files to the workspace on the client.
- **Server Command Menu...** - Pick a command from menus configured on the server.
- **Server Source Control...** - Pick a command from menus configured on the server.

The InterSystems IRIS documentation section [Extending Studio](https://docs.intersystems.com/irislatest/csp/docbook/Doc.View.cls?KEY=ASC#ASC_Hooks_extending_studio) describes how to configure menus for source code control and other purposes. Entries from menus named **%SourceMenu** and **%SourceContext** appear in the **Server Source Control...** quickpick provided the source control class doesn't disable the entry, for example, disabling checkout if it knows that the file is already checked out.

Entries from menus with any other name appear in the **Server Command Menu...**.

## Views and View Containers

Technically the **InterSystems Tools** and **ObjectScript** entities described above are what VS Code calls [view containers](https://code.visualstudio.com/api/extension-capabilities/extending-workbench#view-container). The **InterSystems Tools** view container has a single view called **Servers**. The **ObjectScript** view container has two views: **Explorer** and **Projects**.

When a VS Code container has only a single view in it the view header merges with the container header, with the two names separated by a colon.

Views can be dragged between containers, so for example you could move Explorer off its ObjectScript container and onto the InterSystems Tools container. Or move Servers onto the ObjectScript container. Or move either of them onto VS Code's main Explorer container.

## Server Connection Status Bar Item

The connection status of the current server can be seen in the [VS Code status bar](https://code.visualstudio.com/api/ux-guidelines/status-bar). If the server connection is active, the connected server and namespace will be shown in the status bar. If the server connection info is defined in the [`intersystems.servers` setting object](../settings/#intersystems-servermanager), the name of the server and namepsace will be shown:

![Status bar name](../assets/images/server-status-bar.png "status bar name")

Otherwise, the host, port and namespace will be shown:

![Status bar host port](../assets/images/action-for-server-start.png "status bar host port")

Hover over the status bar item to see more detailed connection information, like a full connection URL and the username of the connection. Click on the status bar item to open the Server Actions menu. Custom entries [can be added](../configuration/#server-actions-menu) to this menu.

If the server connection is inactive, the connection info or the word `ObjectScript` will be shown, accompanied by an error or warning icon:

![Status bar error](../assets/images/server-status-bar-error.png "status bar error")

Hover over the status bar item to see more detailed error information. Click on the status bar item to open a menu that will help you activate your connection.
