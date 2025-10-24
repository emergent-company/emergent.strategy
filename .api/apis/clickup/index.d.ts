import type * as types from './types';
import type { ConfigOptions, FetchResponse } from 'api/dist/core';
import Oas from 'oas';
import APICore from 'api/dist/core';
declare class SDK {
    spec: Oas;
    core: APICore;
    constructor();
    /**
     * Optionally configure various options that the SDK allows.
     *
     * @param config Object of supported SDK options and toggles.
     * @param config.timeout Override the default `fetch` request timeout of 30 seconds. This number
     * should be represented in milliseconds.
     */
    config(config: ConfigOptions): void;
    /**
     * If the API you're using requires authentication you can supply the required credentials
     * through this method and the library will magically determine how they should be used
     * within your API request.
     *
     * With the exception of OpenID and MutualTLS, it supports all forms of authentication
     * supported by the OpenAPI specification.
     *
     * @example <caption>HTTP Basic auth</caption>
     * sdk.auth('username', 'password');
     *
     * @example <caption>Bearer tokens (HTTP or OAuth 2)</caption>
     * sdk.auth('myBearerToken');
     *
     * @example <caption>API Keys</caption>
     * sdk.auth('myApiKey');
     *
     * @see {@link https://spec.openapis.org/oas/v3.0.3#fixed-fields-22}
     * @see {@link https://spec.openapis.org/oas/v3.1.0#fixed-fields-22}
     * @param values Your auth credentials for the API; can specify up to two strings or numbers.
     */
    auth(...values: string[] | number[]): this;
    /**
     * If the API you're using offers alternate server URLs, and server variables, you can tell
     * the SDK which one to use with this method. To use it you can supply either one of the
     * server URLs that are contained within the OpenAPI definition (along with any server
     * variables), or you can pass it a fully qualified URL to use (that may or may not exist
     * within the OpenAPI definition).
     *
     * @example <caption>Server URL with server variables</caption>
     * sdk.server('https://{region}.api.example.com/{basePath}', {
     *   name: 'eu',
     *   basePath: 'v14',
     * });
     *
     * @example <caption>Fully qualified server URL</caption>
     * sdk.server('https://eu.api.example.com/v14');
     *
     * @param url Server URL
     * @param variables An object of variables to replace into the server URL.
     */
    server(url: string, variables?: {}): void;
    /**
     * Upload a file to a task as an attachment. Files stored in the cloud cannot be used in
     * this API request.\
     *  \
     * ***Note:** This request uses multipart/form-data as the content type.*
     *
     * @summary Create Task Attachment
     */
    createTaskAttachment(body: types.CreateTaskAttachmentBodyParam, metadata: types.CreateTaskAttachmentMetadataParam): Promise<FetchResponse<200, types.CreateTaskAttachmentResponse200>>;
    /**
     * These are the routes for authing the API and going through the [OAuth
     * flow](doc:authentication).\
     *  \
     * Applications utilizing a personal API token don't use this endpoint.\
     *  \
     * ***Note:** OAuth tokens are not supported when using the [**Try It**
     * feature](doc:trytheapi) of our Reference docs. You can't try this endpoint from your web
     * browser.*
     *
     * @summary Get Access Token
     */
    getAccessToken(body: types.GetAccessTokenBodyParam): Promise<FetchResponse<200, types.GetAccessTokenResponse200>>;
    /**
     * View the details of the authenticated user's ClickUp account.
     *
     * @summary Get Authorized User
     */
    getAuthorizedUser(): Promise<FetchResponse<200, types.GetAuthorizedUserResponse200>>;
    /**
     * View the Workspaces available to the authenticated user.
     *
     * @summary Get Authorized Workspaces
     */
    getAuthorizedTeams(): Promise<FetchResponse<200, types.GetAuthorizedTeamsResponse200>>;
    /**
     * Add a new checklist to a task.
     *
     * @summary Create Checklist
     */
    createChecklist(body: types.CreateChecklistBodyParam, metadata: types.CreateChecklistMetadataParam): Promise<FetchResponse<200, types.CreateChecklistResponse200>>;
    /**
     * Rename a task checklist, or reorder a checklist so it appears above or below other
     * checklists on a task.
     *
     * @summary Edit Checklist
     */
    editChecklist(body: types.EditChecklistBodyParam, metadata: types.EditChecklistMetadataParam): Promise<FetchResponse<200, types.EditChecklistResponse200>>;
    /**
     * Delete a checklist from a task.
     *
     * @summary Delete Checklist
     */
    deleteChecklist(metadata: types.DeleteChecklistMetadataParam): Promise<FetchResponse<200, types.DeleteChecklistResponse200>>;
    /**
     * Add a line item to a task checklist.
     *
     * @summary Create Checklist Item
     */
    createChecklistItem(body: types.CreateChecklistItemBodyParam, metadata: types.CreateChecklistItemMetadataParam): Promise<FetchResponse<200, types.CreateChecklistItemResponse200>>;
    /**
     * Update an individual line item in a task checklist. \
     *  \
     * You can rename it, set the assignee, mark it as resolved, or nest it under another
     * checklist item.
     *
     * @summary Edit Checklist Item
     */
    editChecklistItem(body: types.EditChecklistItemBodyParam, metadata: types.EditChecklistItemMetadataParam): Promise<FetchResponse<200, types.EditChecklistItemResponse200>>;
    /**
     * Delete a line item from a task checklist.
     *
     * @summary Delete Checklist Item
     */
    deleteChecklistItem(metadata: types.DeleteChecklistItemMetadataParam): Promise<FetchResponse<200, types.DeleteChecklistItemResponse200>>;
    /**
     * View task comments. \
     *  \
     * If you do not include the `start` and `start_id` parameters, this endpoint will return
     * the most recent 25 comments.\
     *  \
     * Use the `start` and `start id` parameters of the oldest comment to retrieve the next 25
     * comments.
     *
     * @summary Get Task Comments
     */
    getTaskComments(metadata: types.GetTaskCommentsMetadataParam): Promise<FetchResponse<200, types.GetTaskCommentsResponse200>>;
    /**
     * Add a new comment to a task.
     *
     * @summary Create Task Comment
     */
    createTaskComment(body: types.CreateTaskCommentBodyParam, metadata: types.CreateTaskCommentMetadataParam): Promise<FetchResponse<200, types.CreateTaskCommentResponse200>>;
    /**
     * View comments from a Chat view. \
     *  \
     * If you do not include the `start` and `start_id` parameters, this endpoint will return
     * the most recent 25 comments.\
     *  \
     * Use the `start` and `start id` parameters of the oldest comment to retrieve the next 25
     * comments.
     *
     * @summary Get Chat View Comments
     */
    getChatViewComments(metadata: types.GetChatViewCommentsMetadataParam): Promise<FetchResponse<200, types.GetChatViewCommentsResponse200>>;
    /**
     * Add a new comment to a Chat view.
     *
     * @summary Create Chat View Comment
     */
    createChatViewComment(body: types.CreateChatViewCommentBodyParam, metadata: types.CreateChatViewCommentMetadataParam): Promise<FetchResponse<200, types.CreateChatViewCommentResponse200>>;
    /**
     * View the comments added to a List. \
     *  \
     * If you do not include the `start` and `start_id` parameters, this endpoint will return
     * the most recent 25 comments.\
     *  \
     * Use the `start` and `start id` parameters of the oldest comment to retrieve the next 25
     * comments.
     *
     * @summary Get List Comments
     */
    getListComments(metadata: types.GetListCommentsMetadataParam): Promise<FetchResponse<200, types.GetListCommentsResponse200>>;
    /**
     * Add a comment to a List.
     *
     * @summary Create List Comment
     */
    createListComment(body: types.CreateListCommentBodyParam, metadata: types.CreateListCommentMetadataParam): Promise<FetchResponse<200, types.CreateListCommentResponse200>>;
    /**
     * Replace the content of a task commment, assign a comment, and mark a comment as
     * resolved.
     *
     * @summary Update Comment
     */
    updateComment(body: types.UpdateCommentBodyParam, metadata: types.UpdateCommentMetadataParam): Promise<FetchResponse<200, types.UpdateCommentResponse200>>;
    /**
     * Delete a task comment.
     *
     * @summary Delete Comment
     */
    deleteComment(metadata: types.DeleteCommentMetadataParam): Promise<FetchResponse<200, types.DeleteCommentResponse200>>;
    /**
     * View threaded comments. The parent comment is not included in the response.
     *
     * @summary Get Threaded Comments
     */
    getThreadedComments(metadata: types.GetThreadedCommentsMetadataParam): Promise<FetchResponse<200, types.GetThreadedCommentsResponse200>>;
    /**
     * Create a threaded comment.
     *
     * @summary Create Threaded Comment
     */
    createThreadedComment(body: types.CreateThreadedCommentBodyParam, metadata: types.CreateThreadedCommentMetadataParam): Promise<FetchResponse<200, types.CreateThreadedCommentResponse200>>;
    /**
     * View the Custom Fields you have access to in a specific List.
     *
     * @summary Get List Custom Fields
     */
    getAccessibleCustomFields(metadata: types.GetAccessibleCustomFieldsMetadataParam): Promise<FetchResponse<200, types.GetAccessibleCustomFieldsResponse200>>;
    /**
     * View the Custom Fields you have access to in a Folder. Get Folder Custom Fields only
     * returns Custom Fields created at the Folder level. Custom Fields created at the List
     * level are not included.
     *
     * @summary Get Folder Custom Fields
     */
    getFolderAvailableFields(metadata: types.GetFolderAvailableFieldsMetadataParam): Promise<FetchResponse<200, types.GetFolderAvailableFieldsResponse200>>;
    /**
     * View the Custom Fields you have access to in a specific Space. Get Space Custom Fields
     * only returns Custom Fields created at the Space level. Custom Fields created at the
     * Folder and List level are not included.
     *
     * @summary Get Space Custom Fields
     */
    getSpaceAvailableFields(metadata: types.GetSpaceAvailableFieldsMetadataParam): Promise<FetchResponse<200, types.GetSpaceAvailableFieldsResponse200>>;
    /**
     * View the Custom Fields you have access to in a specific Workspace. Get Workspace Custom
     * Fields only returns Custom Fields created at the Workspace level. Custom Fields created
     * at the Space, Folder, and List level are not included.
     *
     * @summary Get Workspace Custom Fields
     */
    getTeamAvailableFields(metadata: types.GetTeamAvailableFieldsMetadataParam): Promise<FetchResponse<200, types.GetTeamAvailableFieldsResponse200>>;
    /**
     * Add data to a Custom field on a task. \
     *  \
     * You'll need to know the `task_id` of the task you want to update, and the universal
     * unique identifier (UUID) `field_id` of the Custom Field you want to set. \
     *  \
     * You can use [Get Accessible Custom Fields](ref:getaccessiblecustomfields) or the [Get
     * Task](ref:gettask) endpoint to find the `field_id`.
     *
     * @summary Set Custom Field Value
     */
    setCustomFieldValue(body: types.SetCustomFieldValueBodyParam, metadata: types.SetCustomFieldValueMetadataParam): Promise<FetchResponse<200, types.SetCustomFieldValueResponse200>>;
    /**
     * Remove the data from a Custom Field on a task. This does not delete the option from the
     * Custom Field.
     *
     * @summary Remove Custom Field Value
     */
    removeCustomFieldValue(metadata: types.RemoveCustomFieldValueMetadataParam): Promise<FetchResponse<200, types.RemoveCustomFieldValueResponse200>>;
    /**
     * Set a task as waiting on or blocking another task.
     *
     * @summary Add Dependency
     */
    addDependency(body: types.AddDependencyBodyParam, metadata: types.AddDependencyMetadataParam): Promise<FetchResponse<200, types.AddDependencyResponse200>>;
    /**
     * Remove the dependency relationship between two or more tasks.
     *
     * @summary Delete Dependency
     */
    deleteDependency(metadata: types.DeleteDependencyMetadataParam): Promise<FetchResponse<200, types.DeleteDependencyResponse200>>;
    /**
     * This is the equivalent of the feature _Task Links_ in the right-hand sidebar of a Task.
     * It allows you to link two tasks together. General links or links to other objects than
     * tasks are not supported.
     *
     * @summary Add Task Link
     */
    addTaskLink(metadata: types.AddTaskLinkMetadataParam): Promise<FetchResponse<200, types.AddTaskLinkResponse200>>;
    /**
     * Remove the link between two tasks.
     *
     * @summary Delete Task Link
     */
    deleteTaskLink(metadata: types.DeleteTaskLinkMetadataParam): Promise<FetchResponse<200, types.DeleteTaskLinkResponse200>>;
    /**
     * View the Folders in a Space.
     *
     * @summary Get Folders
     */
    getFolders(metadata: types.GetFoldersMetadataParam): Promise<FetchResponse<200, types.GetFoldersResponse200>>;
    /**
     * Add a new Folder to a Space.
     *
     * @summary Create Folder
     */
    createFolder(body: types.CreateFolderBodyParam, metadata: types.CreateFolderMetadataParam): Promise<FetchResponse<200, types.CreateFolderResponse200>>;
    /**
     * View the Lists within a Folder.
     *
     * @summary Get Folder
     */
    getFolder(metadata: types.GetFolderMetadataParam): Promise<FetchResponse<200, types.GetFolderResponse200>>;
    /**
     * Rename a Folder.
     *
     * @summary Update Folder
     */
    updateFolder(body: types.UpdateFolderBodyParam, metadata: types.UpdateFolderMetadataParam): Promise<FetchResponse<200, types.UpdateFolderResponse200>>;
    /**
     * Delete a Folder from your Workspace.
     *
     * @summary Delete Folder
     */
    deleteFolder(metadata: types.DeleteFolderMetadataParam): Promise<FetchResponse<200, types.DeleteFolderResponse200>>;
    /**
     * View the Goals available in a Workspace.
     *
     * @summary Get Goals
     */
    getGoals(metadata: types.GetGoalsMetadataParam): Promise<FetchResponse<200, types.GetGoalsResponse200>>;
    /**
     * Add a new Goal to a Workspace.
     *
     * @summary Create Goal
     */
    createGoal(body: types.CreateGoalBodyParam, metadata: types.CreateGoalMetadataParam): Promise<FetchResponse<200, types.CreateGoalResponse200>>;
    /**
     * View the details of a Goal including its Targets.
     *
     * @summary Get Goal
     */
    getGoal(metadata: types.GetGoalMetadataParam): Promise<FetchResponse<200, types.GetGoalResponse200>>;
    /**
     * Rename a Goal, set the due date, replace the description, add or remove owners, and set
     * the Goal color.
     *
     * @summary Update Goal
     */
    updateGoal(body: types.UpdateGoalBodyParam, metadata: types.UpdateGoalMetadataParam): Promise<FetchResponse<200, types.UpdateGoalResponse200>>;
    /**
     * Remove a Goal from your Workspace.
     *
     * @summary Delete Goal
     */
    deleteGoal(metadata: types.DeleteGoalMetadataParam): Promise<FetchResponse<200, types.DeleteGoalResponse200>>;
    /**
     * Add a Target to a Goal.
     *
     * @summary Create Key Result
     */
    createKeyResult(body: types.CreateKeyResultBodyParam, metadata: types.CreateKeyResultMetadataParam): Promise<FetchResponse<200, types.CreateKeyResultResponse200>>;
    /**
     * Update a Target.
     *
     * @summary Edit Key Result
     */
    editKeyResult(body: types.EditKeyResultBodyParam, metadata: types.EditKeyResultMetadataParam): Promise<FetchResponse<200, types.EditKeyResultResponse200>>;
    /**
     * Delete a target from a Goal.
     *
     * @summary Delete Key Result
     */
    deleteKeyResult(metadata: types.DeleteKeyResultMetadataParam): Promise<FetchResponse<200, types.DeleteKeyResultResponse200>>;
    /**
     * Invite a guest to join a Workspace. To invite a member to your Workspace, use the
     * [Invite User to Workspace](ref:inviteusertoworkspace) endpoint. \
     *  \
     * You'll also need to grant the guest access to specific items using the following
     * endpoints: [Add Guest to Folder](ref:addguesttofolder), [Add Guest to
     * List](ref:addguesttolist), or [Add Guest to Task](ref:addguesttotask). \
     *  \
     * ***Note:** This endpoint is only available to Workspaces on our [Enterprise
     * Plan](https://clickup.com/pricing).*
     *
     * @summary Invite Guest To Workspace
     */
    inviteGuestToWorkspace(body: types.InviteGuestToWorkspaceBodyParam, metadata: types.InviteGuestToWorkspaceMetadataParam): Promise<FetchResponse<200, types.InviteGuestToWorkspaceResponse200>>;
    /**
     * View information about a guest. \
     *  \
     * ***Note:** This endpoint is only available to Workspaces on our [Enterprise
     * Plan](https://clickup.com/pricing).*
     *
     * @summary Get Guest
     */
    getGuest(metadata: types.GetGuestMetadataParam): Promise<FetchResponse<200, types.GetGuestResponse200>>;
    /**
     * Configure options for a guest. \
     *  \
     * ***Note:** This endpoint is only available to Workspaces on our [Enterprise
     * Plan](https://clickup.com/pricing).*
     *
     * @summary Edit Guest On Workspace
     */
    editGuestOnWorkspace(body: types.EditGuestOnWorkspaceBodyParam, metadata: types.EditGuestOnWorkspaceMetadataParam): Promise<FetchResponse<200, types.EditGuestOnWorkspaceResponse200>>;
    editGuestOnWorkspace(metadata: types.EditGuestOnWorkspaceMetadataParam): Promise<FetchResponse<200, types.EditGuestOnWorkspaceResponse200>>;
    /**
     * Revoke a guest's access to a Workspace. \
     *  \
     * ***Note:** This endpoint is only available to Workspaces on our [Enterprise
     * Plan](https://clickup.com/pricing).*
     *
     * @summary Remove Guest From Workspace
     */
    removeGuestFromWorkspace(metadata: types.RemoveGuestFromWorkspaceMetadataParam): Promise<FetchResponse<200, types.RemoveGuestFromWorkspaceResponse200>>;
    /**
     * Share a task with a guest. \
     *  \
     * ***Note:** This endpoint is only available to Workspaces on our [Enterprise
     * Plan](https://clickup.com/pricing).*
     *
     * @summary Add Guest To Task
     */
    addGuestToTask(body: types.AddGuestToTaskBodyParam, metadata: types.AddGuestToTaskMetadataParam): Promise<FetchResponse<200, types.AddGuestToTaskResponse200>>;
    /**
     * Revoke a guest's access to a task. \
     *  \
     * ***Note:** This endpoint is only available to Workspaces on our [Enterprise
     * Plan](https://clickup.com/pricing).*
     *
     * @summary Remove Guest From Task
     */
    removeGuestFromTask(metadata: types.RemoveGuestFromTaskMetadataParam): Promise<FetchResponse<200, types.RemoveGuestFromTaskResponse200>>;
    /**
     * Share a List with a guest. \
     *  \
     * ***Note:** This endpoint is only available to Workspaces on our [Enterprise
     * Plan](https://clickup.com/pricing).*
     *
     * @summary Add Guest To List
     */
    addGuestToList(body: types.AddGuestToListBodyParam, metadata: types.AddGuestToListMetadataParam): Promise<FetchResponse<200, types.AddGuestToListResponse200>>;
    /**
     * Revoke a guest's access to a List.\
     *  \
     * ***Note:** This endpoint is only available to Workspaces on our [Enterprise
     * Plan](https://clickup.com/pricing).*
     *
     * @summary Remove Guest From List
     */
    removeGuestFromList(metadata: types.RemoveGuestFromListMetadataParam): Promise<FetchResponse<200, types.RemoveGuestFromListResponse200>>;
    /**
     * Share a Folder with a guest. \
     *  \
     * ***Note:** This endpoint is only available to Workspaces on our [Enterprise
     * Plan](https://clickup.com/pricing).*
     *
     * @summary Add Guest To Folder
     */
    addGuestToFolder(body: types.AddGuestToFolderBodyParam, metadata: types.AddGuestToFolderMetadataParam): Promise<FetchResponse<200, types.AddGuestToFolderResponse200>>;
    /**
     * Revoke a guest's access to a Folder. \
     *  \
     * ***Note:** This endpoint is only available to Workspaces on our [Enterprise
     * Plan](https://clickup.com/pricing).*
     *
     * @summary Remove Guest From Folder
     */
    removeGuestFromFolder(metadata: types.RemoveGuestFromFolderMetadataParam): Promise<FetchResponse<200, types.RemoveGuestFromFolderResponse200>>;
    /**
     * View the Lists within a Folder.
     *
     * @summary Get Lists
     */
    getLists(metadata: types.GetListsMetadataParam): Promise<FetchResponse<200, types.GetListsResponse200>>;
    /**
     * Add a new List to a Folder.
     *
     * @summary Create List
     */
    createList(body: types.CreateListBodyParam, metadata: types.CreateListMetadataParam): Promise<FetchResponse<200, types.CreateListResponse200>>;
    /**
     * Create a new Folder using a Folder template within a Space. This endpoint allows you to
     * create a folder with all its nested assets (lists, tasks, etc.) from a predefined
     * template available in your Workspace. Publicly shared templates must be [added to your
     * Workspace](https://help.clickup.com/hc/en-us/articles/6326023965591-Add-a-template-to-your-library)
     * before you can use them with the public API.
     * This request can be run asynchronously or synchronously via the `return_immediately`
     * parameter.
     *
     * @summary Create Folder from template
     * @throws FetchError<400, types.CreateFolderFromTemplateResponse400> Bad request - Name is required
     */
    createFolderFromTemplate(body: types.CreateFolderFromTemplateBodyParam, metadata: types.CreateFolderFromTemplateMetadataParam): Promise<FetchResponse<200, types.CreateFolderFromTemplateResponse200>>;
    /**
     * View the Lists in a Space that aren't located in a Folder.
     *
     * @summary Get Folderless Lists
     */
    getFolderlessLists(metadata: types.GetFolderlessListsMetadataParam): Promise<FetchResponse<200, types.GetFolderlessListsResponse200>>;
    /**
     * Add a new List in a Space.
     *
     * @summary Create Folderless List
     */
    createFolderlessList(body: types.CreateFolderlessListBodyParam, metadata: types.CreateFolderlessListMetadataParam): Promise<FetchResponse<200, types.CreateFolderlessListResponse200>>;
    /**
     * View information about a List.
     *
     * @summary Get List
     */
    getList(metadata: types.GetListMetadataParam): Promise<FetchResponse<200, types.GetListResponse200>>;
    /**
     * Rename a List, update the List Info description, set a due date/time, set the List's
     * priority, set an assignee, set or remove the List color.
     *
     * @summary Update List
     */
    updateList(body: types.UpdateListBodyParam, metadata: types.UpdateListMetadataParam): Promise<FetchResponse<200, types.UpdateListResponse200>>;
    /**
     * Delete a List from your Workspace.
     *
     * @summary Delete List
     */
    deleteList(metadata: types.DeleteListMetadataParam): Promise<FetchResponse<200, types.DeleteListResponse200>>;
    /**
     * Add a task to an additional List. \
     *  \
     * ***Note:** This endpoint requires the [Tasks in Multiple List
     * ClickApp](https://help.clickup.com/hc/en-us/articles/6309958824727-Tasks-in-Multiple-Lists)
     * to be enabled.*
     *
     * @summary Add Task To List
     */
    addTaskToList(metadata: types.AddTaskToListMetadataParam): Promise<FetchResponse<200, types.AddTaskToListResponse200>>;
    /**
     * Remove a task from an additional List. You can't remove a task from its home List. \
     *  \
     * ***Note:** This endpoint requires the [Tasks in Multiple List
     * ClickApp](https://help.clickup.com/hc/en-us/articles/6309958824727-Tasks-in-Multiple-Lists)
     * to be enabled.*
     *
     * @summary Remove Task From List
     */
    removeTaskFromList(metadata: types.RemoveTaskFromListMetadataParam): Promise<FetchResponse<200, types.RemoveTaskFromListResponse200>>;
    /**
     * View the people who have access to a task. Responses do not include people with
     * inherited Hierarchy permission to the task.
     *
     * @summary Get Task Members
     */
    getTaskMembers(metadata: types.GetTaskMembersMetadataParam): Promise<FetchResponse<200, types.GetTaskMembersResponse200>>;
    /**
     * Get Workspace members who have access to a List.
     *
     * @summary Get List Members
     */
    getListMembers(metadata: types.GetListMembersMetadataParam): Promise<FetchResponse<200, types.GetListMembersResponse200>>;
    /**
     * View the Custom Roles available in a Workspace.
     *
     * @summary Get Custom Roles
     */
    getCustomRoles(metadata: types.GetCustomRolesMetadataParam): Promise<FetchResponse<200, types.GetCustomRolesResponse200>>;
    /**
     * View the tasks, Lists, and Folders that have been shared with the authenticated user.
     *
     * @summary Shared Hierarchy
     */
    sharedHierarchy(metadata: types.SharedHierarchyMetadataParam): Promise<FetchResponse<200, types.SharedHierarchyResponse200>>;
    /**
     * View the Spaces avialable in a Workspace. You can only get member info in private
     * Spaces.
     *
     * @summary Get Spaces
     */
    getSpaces(metadata: types.GetSpacesMetadataParam): Promise<FetchResponse<200, types.GetSpacesResponse200>>;
    /**
     * Add a new Space to a Workspace.
     *
     * @summary Create Space
     */
    createSpace(body: types.CreateSpaceBodyParam, metadata: types.CreateSpaceMetadataParam): Promise<FetchResponse<200, types.CreateSpaceResponse200>>;
    /**
     * View the Spaces available in a Workspace.
     *
     * @summary Get Space
     */
    getSpace(metadata: types.GetSpaceMetadataParam): Promise<FetchResponse<200, types.GetSpaceResponse200>>;
    /**
     * Rename, set the Space color, and enable ClickApps for a Space.
     *
     * @summary Update Space
     */
    updateSpace(body: types.UpdateSpaceBodyParam, metadata: types.UpdateSpaceMetadataParam): Promise<FetchResponse<200, types.UpdateSpaceResponse200>>;
    /**
     * Delete a Space from your Workspace.
     *
     * @summary Delete Space
     */
    deleteSpace(metadata: types.DeleteSpaceMetadataParam): Promise<FetchResponse<200, types.DeleteSpaceResponse200>>;
    /**
     * View the task Tags available in a Space.
     *
     * @summary Get Space Tags
     */
    getSpaceTags(metadata: types.GetSpaceTagsMetadataParam): Promise<FetchResponse<200, types.GetSpaceTagsResponse200>>;
    /**
     * Add a new task Tag to a Space.
     *
     * @summary Create Space Tag
     */
    createSpaceTag(body: types.CreateSpaceTagBodyParam, metadata: types.CreateSpaceTagMetadataParam): Promise<FetchResponse<200, types.CreateSpaceTagResponse200>>;
    /**
     * Update a task Tag.
     *
     * @summary Edit Space Tag
     */
    editSpaceTag(body: types.EditSpaceTagBodyParam, metadata: types.EditSpaceTagMetadataParam): Promise<FetchResponse<200, types.EditSpaceTagResponse200>>;
    /**
     * Delete a task Tag from a Space.
     *
     * @summary Delete Space Tag
     */
    deleteSpaceTag(body: types.DeleteSpaceTagBodyParam, metadata: types.DeleteSpaceTagMetadataParam): Promise<FetchResponse<200, types.DeleteSpaceTagResponse200>>;
    /**
     * Add a Tag to a task.
     *
     * @summary Add Tag To Task
     */
    addTagToTask(metadata: types.AddTagToTaskMetadataParam): Promise<FetchResponse<200, types.AddTagToTaskResponse200>>;
    /**
     * Remove a Tag from a task. This does not delete the Tag from the Space.
     *
     * @summary Remove Tag From Task
     */
    removeTagFromTask(metadata: types.RemoveTagFromTaskMetadataParam): Promise<FetchResponse<200, types.RemoveTagFromTaskResponse200>>;
    /**
     * View the tasks in a List. Responses are limited to 100 tasks per page. You can only view
     * task information of tasks you can access. \
     *  \
     * This endpoint only includes tasks where the specified `list_id` is their home List.
     * Tasks added to the `list_id` with a different home List are not included in the response
     * by default. To include tasks that exist in multiple lists, use the `include_timl`
     * parameter. \
     *  \
     * The `time_spent` field displays time tracked in milliseconds, and is only included in
     * the response for tasks with time entries.
     *
     * @summary Get Tasks
     */
    getTasks(metadata: types.GetTasksMetadataParam): Promise<FetchResponse<200, types.GetTasksResponse200>>;
    /**
     * Create a new task.
     *
     * @summary Create Task
     */
    createTask(body: types.CreateTaskBodyParam, metadata: types.CreateTaskMetadataParam): Promise<FetchResponse<200, types.CreateTaskResponse200>>;
    /**
     * View information about a task. You can only view task information of tasks you can
     * access. \
     *  \
     * Tasks with attachments will return an "attachments" response. \
     *  \
     * Docs attached to a task are not returned.
     *
     * @summary Get Task
     */
    getTask(metadata: types.GetTaskMetadataParam): Promise<FetchResponse<200, types.GetTaskResponse200>>;
    /**
     * Update a task by including one or more fields in the request body.
     *
     * @summary Update Task
     */
    updateTask(body: types.UpdateTaskBodyParam, metadata: types.UpdateTaskMetadataParam): Promise<FetchResponse<200, types.UpdateTaskResponse200>>;
    /**
     * Delete a task from your Workspace.
     *
     * @summary Delete Task
     */
    deleteTask(metadata: types.DeleteTaskMetadataParam): Promise<FetchResponse<204, types.DeleteTaskResponse204>>;
    /**
     * View the tasks that meet specific criteria from a Workspace. Responses are limited to
     * 100 tasks per page.  \
     *  \
     * You can only view task information of tasks you can access. \
     *  \
     *  Our Try It modal currently supports filtering by two or more Lists, Folders, or Spaces.
     * To filter by a single List, Folder, or Space, we recommend using a free app like
     * [Postman](https://www.postman.com/) to test our public API.
     *
     * @summary Get Filtered Team Tasks
     */
    getFilteredTeamTasks(metadata: types.GetFilteredTeamTasksMetadataParam): Promise<FetchResponse<200, types.GetFilteredTeamTasksResponse200>>;
    /**
     * Merge multiple tasks into a target task. The target task is specified by the task_id
     * parameter, while the source tasks to be merged are provided in the request body. Custom
     * Task IDs are not supported.
     *
     * @summary Merge Tasks
     */
    mergeTasks(body: types.MergeTasksBodyParam, metadata: types.MergeTasksMetadataParam): Promise<FetchResponse<number, unknown>>;
    /**
     * View how long a task has been in each status. The Total time in Status ClickApp must
     * first be enabled by the Workspace owner or an admin.
     *
     * @summary Get Task's Time in Status
     */
    getTaskSTimeinStatus(metadata: types.GetTaskSTimeinStatusMetadataParam): Promise<FetchResponse<200, types.GetTaskSTimeinStatusResponse200>>;
    /**
     * View how long two or more tasks have been in each status. The Total time in Status
     * ClickApp must first be enabled by the Workspace owner or an admin.
     *
     * @summary Get Bulk Tasks' Time in Status
     */
    getBulkTasksTimeinStatus(metadata: types.GetBulkTasksTimeinStatusMetadataParam): Promise<FetchResponse<200, types.GetBulkTasksTimeinStatusResponse200>>;
    /**
     * View the task templates available in a Workspace.
     *
     * @summary Get Task Templates
     */
    getTaskTemplates(metadata: types.GetTaskTemplatesMetadataParam): Promise<FetchResponse<200, types.GetTaskTemplatesResponse200>>;
    /**
     * Create a new task using a task template defined in your workspace. Publicly shared
     * templates must be [added to your
     * Workspace](https://help.clickup.com/hc/en-us/articles/6326023965591-Add-a-template-to-your-library)
     * before you can use them with the public API.
     *
     * @summary Create Task From Template
     */
    createTaskFromTemplate(body: types.CreateTaskFromTemplateBodyParam, metadata: types.CreateTaskFromTemplateMetadataParam): Promise<FetchResponse<200, types.CreateTaskFromTemplateResponse200>>;
    /**
     * Create a new list using a list template in a Folder. Publicly shared templates must be
     * [added to your
     * Workspace](https://help.clickup.com/hc/en-us/articles/6326023965591-Add-a-template-to-your-library)
     * before you can use them with the public API.
     * This request runs synchronously by default with `return_immediately=true`.
     * The request returns the future List ID immediatly, but the List may not be created when
     * the response is sent.
     * Small templates can be applied synchronously, which guarantees that all sub objects are
     * created.
     * In case of a timeout on synchronous requests, the objects from the template will
     * continue to be created past the timeout.
     *
     * @summary Create List From Template in Folder
     * @throws FetchError<400, types.CreateFolderListFromTemplateResponse400> Bad request - Name is required
     */
    createFolderListFromTemplate(body: types.CreateFolderListFromTemplateBodyParam, metadata: types.CreateFolderListFromTemplateMetadataParam): Promise<FetchResponse<200, types.CreateFolderListFromTemplateResponse200>>;
    /**
     * Create a new List using a List template within a Space. Publicly shared templates must
     * be [added to your
     * Workspace](https://help.clickup.com/hc/en-us/articles/6326023965591-Add-a-template-to-your-library)
     * before you can use them with the public API.
     * This request can be run asynchronously or synchronously via the `return_immediately`
     * parameter.
     *
     * @summary Create List From Template in Space.
     * @throws FetchError<400, types.CreateSpaceListFromTemplateResponse400> Bad request - Name is required, or is already taken
     */
    createSpaceListFromTemplate(body: types.CreateSpaceListFromTemplateBodyParam, metadata: types.CreateSpaceListFromTemplateMetadataParam): Promise<FetchResponse<200, types.CreateSpaceListFromTemplateResponse200>>;
    /**
     * View the used, total, and available member and guest seats for a Workspace.
     *
     * @summary Get Workspace seats
     */
    getWorkspaceseats(metadata: types.GetWorkspaceseatsMetadataParam): Promise<FetchResponse<200, types.GetWorkspaceseatsResponse200>>;
    /**
     * View the current [Plan](https://clickup.com/pricing) for the specified Workspace.
     *
     * @summary Get Workspace Plan
     */
    getWorkspaceplan(metadata: types.GetWorkspaceplanMetadataParam): Promise<FetchResponse<200, types.GetWorkspaceplanResponse200>>;
    /**
     * This endpoint creates a [User
     * Group](https://docs.clickup.com/en/articles/4010016-teams-how-to-create-user-groups)
     * within a Workspace.\
     *  \
     * User Groups are used to organize and manage users within a Workspace.\
     *  \
     * In the API documentation, `team_id` refers to the Workspace ID, and `group_id` refers to
     * the User Group ID.\
     *  \
     * **Note:** Adding a guest with view-only permissions to a Team automatically converts
     * them to a paid guest.\
     *  \
     * If no paid guest seats are available, an additional member seat will be added,
     * increasing the number of paid guest seats.\
     *  \
     * This change incurs a prorated charge based on the billing cycle.
     *
     * @summary Create Group
     */
    createUserGroup(body: types.CreateUserGroupBodyParam, metadata: types.CreateUserGroupMetadataParam): Promise<FetchResponse<200, types.CreateUserGroupResponse200>>;
    /**
     * View the custom task types available in a Workspace.
     *
     * @summary Get Custom Task Types
     */
    getCustomItems(metadata: types.GetCustomItemsMetadataParam): Promise<FetchResponse<200, types.GetCustomItemsResponse200>>;
    /**
     * This endpoint is used to manage [User
     * Groups](https://docs.clickup.com/en/articles/4010016-teams-how-to-create-user-groups),
     * which are groups of users within your Workspace.\
     *  \
     * In our API, `team_id` in the path refers to the Workspace ID, and `group_id` refers to
     * the ID of a User Group.\
     *  \
     * **Note:** Adding a guest with view-only permissions to a User Group automatically
     * converts them to a paid guest.\
     *  \
     * If you don't have any paid guest seats available, a new member seat is automatically
     * added to increase the number of paid guest seats.\
     *  \
     * This incurs a prorated charge based on your billing cycle.
     *
     * @summary Update Group
     */
    updateTeam(body: types.UpdateTeamBodyParam, metadata: types.UpdateTeamMetadataParam): Promise<FetchResponse<200, types.UpdateTeamResponse200>>;
    /**
     * This endpoint is used to remove a [User
     * Group](https://docs.clickup.com/en/articles/4010016-teams-how-to-create-user-groups)
     * from your Workspace.\
     *  \
     * In our API documentation, `team_id` refers to the id of a Workspace, and `group_id`
     * refers to the id of a user group.
     *
     * @summary Delete Group
     */
    deleteTeam(metadata: types.DeleteTeamMetadataParam): Promise<FetchResponse<200, types.DeleteTeamResponse200>>;
    /**
     * This endpoint is used to view [User
     * Groups](https://docs.clickup.com/en/articles/4010016-teams-how-to-create-user-groups) in
     * your Workspace.\
     *  \
     * In our API documentation, `team_id` refers to the ID of a Workspace, and `group_id`
     * refers to the ID of a User Group.
     *
     * @summary Get Groups
     */
    getTeams1(metadata: types.GetTeams1MetadataParam): Promise<FetchResponse<200, types.GetTeams1Response200>>;
    /**
     * ***Note:** This is a legacy time tracking endpoint. We recommend using the Time Tracking
     * API endpoints to manage time entries.*
     *
     * @summary Get tracked time
     */
    gettrackedtime(metadata: types.GettrackedtimeMetadataParam): Promise<FetchResponse<200, types.GettrackedtimeResponse200>>;
    /**
     * ***Note:** This is a legacy time tracking endpoint. We recommend using the Time Tracking
     * API endpoints to manage time entries.*
     *
     * @summary Track time
     */
    tracktime(body: types.TracktimeBodyParam, metadata: types.TracktimeMetadataParam): Promise<FetchResponse<200, types.TracktimeResponse200>>;
    /**
     * ***Note:** This is a legacy time tracking endpoint. We recommend using the Time Tracking
     * API endpoints to manage time entries.*
     *
     * @summary Edit time tracked
     */
    edittimetracked(body: types.EdittimetrackedBodyParam, metadata: types.EdittimetrackedMetadataParam): Promise<FetchResponse<200, types.EdittimetrackedResponse200>>;
    /**
     * ***Note:** This is a legacy time tracking endpoint. We recommend using the Time Tracking
     * API endpoints to manage time entries.*
     *
     * @summary Delete time tracked
     */
    deletetimetracked(metadata: types.DeletetimetrackedMetadataParam): Promise<FetchResponse<200, types.DeletetimetrackedResponse200>>;
    /**
     * View time entries filtered by start and end date. \
     *  \
     * By default, this endpoint returns time entries from the last 30 days created by the
     * authenticated user. \
     *  \
     * To retrieve time entries for other users, you must include the `assignee` query
     * parameter. \
     *  \
     * Only one of the following location filters can be included at a time: `space_id`,
     * `folder_id`, `list_id`, or `task_id`. \
     *  \
     * ***Note:** A time entry that has a negative duration means that timer is currently
     * running for that user.*
     *
     * @summary Get time entries within a date range
     */
    gettimeentrieswithinadaterange(metadata: types.GettimeentrieswithinadaterangeMetadataParam): Promise<FetchResponse<200, types.GettimeentrieswithinadaterangeResponse200>>;
    /**
     * Create a time entry. \
     *  \
     * ***Note:** A time entry that has a negative duration means that timer is currently
     * running for that user.*
     *
     * @summary Create a time entry
     */
    createatimeentry(body: types.CreateatimeentryBodyParam, metadata: types.CreateatimeentryMetadataParam): Promise<FetchResponse<200, types.CreateatimeentryResponse200>>;
    /**
     * View a single time entry. \
     *  \
     * ***Note:** A time entry that has a negative duration means that timer is currently
     * running for that user.*
     *
     * @summary Get singular time entry
     */
    getsingulartimeentry(metadata: types.GetsingulartimeentryMetadataParam): Promise<FetchResponse<200, types.GetsingulartimeentryResponse200>>;
    /**
     * Delete a time entry from a Workspace.
     *
     * @summary Delete a time Entry
     */
    deleteatimeEntry(metadata: types.DeleteatimeEntryMetadataParam): Promise<FetchResponse<200, types.DeleteatimeEntryResponse200>>;
    /**
     * Update the details of a time entry.
     *
     * @summary Update a time Entry
     */
    updateatimeEntry(body: types.UpdateatimeEntryBodyParam, metadata: types.UpdateatimeEntryMetadataParam): Promise<FetchResponse<200, types.UpdateatimeEntryResponse200>>;
    /**
     * View a list of changes made to a time entry.
     *
     * @summary Get time entry history
     */
    gettimeentryhistory(metadata: types.GettimeentryhistoryMetadataParam): Promise<FetchResponse<200, types.GettimeentryhistoryResponse200>>;
    /**
     * View a time entry that's currently tracking time for the authenticated user. \
     *  \
     * ***Note:** A time entry that has a negative duration means that timer is currently
     * running for that user.*
     *
     * @summary Get running time entry
     */
    getrunningtimeentry(metadata: types.GetrunningtimeentryMetadataParam): Promise<FetchResponse<200, types.GetrunningtimeentryResponse200>>;
    /**
     * Remove labels from time entries. This does not remove the label from a Workspace.
     *
     * @summary Remove tags from time entries
     */
    removetagsfromtimeentries(body: types.RemovetagsfromtimeentriesBodyParam, metadata: types.RemovetagsfromtimeentriesMetadataParam): Promise<FetchResponse<200, types.RemovetagsfromtimeentriesResponse200>>;
    /**
     * View all the labels that have been applied to time entries in a Workspace.
     *
     * @summary Get all tags from time entries
     */
    getalltagsfromtimeentries(metadata: types.GetalltagsfromtimeentriesMetadataParam): Promise<FetchResponse<200, types.GetalltagsfromtimeentriesResponse200>>;
    /**
     * Add a label to a time entry.
     *
     * @summary Add tags from time entries
     */
    addtagsfromtimeentries(body: types.AddtagsfromtimeentriesBodyParam, metadata: types.AddtagsfromtimeentriesMetadataParam): Promise<FetchResponse<200, types.AddtagsfromtimeentriesResponse200>>;
    /**
     * Rename an time entry label.
     *
     * @summary Change tag names from time entries
     */
    changetagnamesfromtimeentries(body: types.ChangetagnamesfromtimeentriesBodyParam, metadata: types.ChangetagnamesfromtimeentriesMetadataParam): Promise<FetchResponse<200, types.ChangetagnamesfromtimeentriesResponse200>>;
    /**
     * Start a timer for the authenticated user.
     *
     * @summary Start a time Entry
     */
    startatimeEntry(body: types.StartatimeEntryBodyParam, metadata: types.StartatimeEntryMetadataParam): Promise<FetchResponse<200, types.StartatimeEntryResponse200>>;
    /**
     * Stop a timer that's currently running for the authenticated user.
     *
     * @summary Stop a time Entry
     */
    stopatimeEntry(metadata: types.StopatimeEntryMetadataParam): Promise<FetchResponse<200, types.StopatimeEntryResponse200>>;
    /**
     * Invite someone to join your Workspace as a member. To invite someone as a guest, use the
     * [Invite Guest](ref:inviteguesttoworkspace) endpoint.\
     *  \
     * ***Note:** This endpoint is only available to Workspaces on our [Enterprise
     * Plan](https://clickup.com/pricing).*
     *
     * @summary Invite User To Workspace
     */
    inviteUserToWorkspace(body: types.InviteUserToWorkspaceBodyParam, metadata: types.InviteUserToWorkspaceMetadataParam): Promise<FetchResponse<200, types.InviteUserToWorkspaceResponse200>>;
    /**
     * View information about a user in a Workspace. \
     *  \
     * ***Note:** This endpoint is only available to Workspaces on our [Enterprise
     * Plan](https://clickup.com/pricing).*
     *
     * @summary Get User
     */
    getUser(metadata: types.GetUserMetadataParam): Promise<FetchResponse<200, types.GetUserResponse200>>;
    /**
     * Update a user's name and role. \
     *  \
     * ***Note:** This endpoint is only available to Workspaces on our [Enterprise
     * Plan](https://clickup.com/pricing).*
     *
     * @summary Edit User On Workspace
     */
    editUserOnWorkspace(body: types.EditUserOnWorkspaceBodyParam, metadata: types.EditUserOnWorkspaceMetadataParam): Promise<FetchResponse<200, types.EditUserOnWorkspaceResponse200>>;
    /**
     * Deactivate a user from a Workspace. \
     *  \
     * ***Note:** This endpoint is only available to Workspaces on our [Enterprise
     * Plan](https://clickup.com/pricing).*
     *
     * @summary Remove User From Workspace
     */
    removeUserFromWorkspace(metadata: types.RemoveUserFromWorkspaceMetadataParam): Promise<FetchResponse<200, types.RemoveUserFromWorkspaceResponse200>>;
    /**
     * View the task and page views available at the Everything Level of a Workspace.
     *
     * @summary Get Workspace (Everything level) Views
     */
    getTeamViews(metadata: types.GetTeamViewsMetadataParam): Promise<FetchResponse<200, types.GetTeamViewsResponse200>>;
    /**
     * Add a List, Board, Calendar, Table, Timeline, Workload, Activity, Map, Chat, or Gantt
     * view at the Everything Level of a Workspace.
     *
     * @summary Create Workspace (Everything level) View
     */
    createTeamView(body: types.CreateTeamViewBodyParam, metadata: types.CreateTeamViewMetadataParam): Promise<FetchResponse<200, types.CreateTeamViewResponse200>>;
    /**
     * View the task and page views available for a Space.
     *
     * @summary Get Space Views
     */
    getSpaceViews(metadata: types.GetSpaceViewsMetadataParam): Promise<FetchResponse<200, types.GetSpaceViewsResponse200>>;
    /**
     * Add a List, Board, Calendar, Table, Timeline, Workload, Activity, Map, Chat, or Gantt
     * view to a Space.
     *
     * @summary Create Space View
     */
    createSpaceView(body: types.CreateSpaceViewBodyParam, metadata: types.CreateSpaceViewMetadataParam): Promise<FetchResponse<200, types.CreateSpaceViewResponse200>>;
    /**
     * View the task and page views available for a Folder.
     *
     * @summary Get Folder Views
     */
    getFolderViews(metadata: types.GetFolderViewsMetadataParam): Promise<FetchResponse<200, types.GetFolderViewsResponse200>>;
    /**
     * Add a List, Board, Calendar, Table, Timeline, Workload, Activity, Map, Chat, or Gantt
     * view to a Folder.
     *
     * @summary Create Folder View
     */
    createFolderView(body: types.CreateFolderViewBodyParam, metadata: types.CreateFolderViewMetadataParam): Promise<FetchResponse<200, types.CreateFolderViewResponse200>>;
    /**
     * View the task and page views available for a List.<br> Views and required views are
     * separate responses.
     *
     * @summary Get List Views
     */
    getListViews(metadata: types.GetListViewsMetadataParam): Promise<FetchResponse<200, types.GetListViewsResponse200>>;
    /**
     * Add a List, Board, Calendar, Table, Timeline, Workload, Activity, Map, Chat, or Gantt
     * view to a List.
     *
     * @summary Create List View
     */
    createListView(body: types.CreateListViewBodyParam, metadata: types.CreateListViewMetadataParam): Promise<FetchResponse<200, types.CreateListViewResponse200>>;
    /**
     * View information about a specific task or page view.
     *
     * @summary Get View
     */
    getView(metadata: types.GetViewMetadataParam): Promise<FetchResponse<200, types.GetViewResponse200>>;
    /**
     * Rename a view, update the grouping, sorting, filters, columns, and settings of a view.
     *
     * @summary Update View
     */
    updateView(body: types.UpdateViewBodyParam, metadata: types.UpdateViewMetadataParam): Promise<FetchResponse<200, types.UpdateViewResponse200>>;
    /**
     * Delete View
     *
     */
    deleteView(metadata: types.DeleteViewMetadataParam): Promise<FetchResponse<200, types.DeleteViewResponse200>>;
    /**
     * See all visible tasks in a view in ClickUp.
     *
     * @summary Get View Tasks
     */
    getViewTasks(metadata: types.GetViewTasksMetadataParam): Promise<FetchResponse<200, types.GetViewTasksResponse200>>;
    /**
     * View the webhooks created via the API for a Workspace. This endpoint returns webhooks
     * created by the authenticated user.
     *
     * @summary Get Webhooks
     */
    getWebhooks(metadata: types.GetWebhooksMetadataParam): Promise<FetchResponse<200, types.GetWebhooksResponse200>>;
    /**
     * Set up a webhook to monitor for events.<br> We do not have a dedicated IP address for
     * webhooks. We use our domain name and dynamic addressing.
     *
     * @summary Create Webhook
     */
    createWebhook(body: types.CreateWebhookBodyParam, metadata: types.CreateWebhookMetadataParam): Promise<FetchResponse<200, types.CreateWebhookResponse200>>;
    /**
     * Update a webhook to change the events to be monitored.
     *
     * @summary Update Webhook
     */
    updateWebhook(body: types.UpdateWebhookBodyParam, metadata: types.UpdateWebhookMetadataParam): Promise<FetchResponse<200, types.UpdateWebhookResponse200>>;
    /**
     * Delete a webhook to stop monitoring the events and locations of the webhook.
     *
     * @summary Delete Webhook
     */
    deleteWebhook(metadata: types.DeleteWebhookMetadataParam): Promise<FetchResponse<200, types.DeleteWebhookResponse200>>;
    /**
     * View the Docs in your Workspace. You can only view information of Docs you can access.
     *
     * @summary Search Docs
     */
    searchDocs(metadata: types.SearchDocsMetadataParam): Promise<FetchResponse<200, types.SearchDocsResponse200>>;
    /**
     * Create a new Doc.
     *
     * @summary Create Doc
     */
    createDoc(body: types.CreateDocBodyParam, metadata: types.CreateDocMetadataParam): Promise<FetchResponse<201, types.CreateDocResponse201>>;
    /**
     * View information about a Doc.
     *
     * @summary Get Doc
     */
    getDoc(metadata: types.GetDocMetadataParam): Promise<FetchResponse<200, types.GetDocResponse200>>;
    /**
     * View the PageListing for a Doc.
     *
     * @summary Get Doc PageListing
     */
    getDocPageListing(metadata: types.GetDocPageListingMetadataParam): Promise<FetchResponse<200, types.GetDocPageListingResponse200>>;
    /**
     * View pages belonging to a Doc.
     *
     * @summary Get Doc pages
     */
    getDocPages(metadata: types.GetDocPagesMetadataParam): Promise<FetchResponse<200, types.GetDocPagesResponse200>>;
    /**
     * Create a page in a Doc.
     *
     * @summary Create page
     */
    createPage(body: types.CreatePageBodyParam, metadata: types.CreatePageMetadataParam): Promise<FetchResponse<201, types.CreatePageResponse201>>;
    /**
     * View the information about a page in a Doc. Due to markdown format limitations, some
     * content elements [will not be displayed exactly as they appear in
     * ClickUp.](doc:docsimportexportlimitations/)
     *
     * @summary Get page
     */
    getPage(metadata: types.GetPageMetadataParam): Promise<FetchResponse<200, types.GetPageResponse200>>;
    /**
     * Edit a page in a Doc.
     *
     * @summary Edit page
     */
    editPage(body: types.EditPageBodyParam, metadata: types.EditPageMetadataParam): Promise<FetchResponse<200, types.EditPageResponse200>>;
    /**
     * Create Workspace-level audit logs. Audit logs can only be created by the Workspace owner
     * on Enterprise Plans.
     *
     * @summary Create Workspace-level audit logs
     */
    createWorkspaceAuditLog(body: types.CreateWorkspaceAuditLogBodyParam, metadata: types.CreateWorkspaceAuditLogMetadataParam): Promise<FetchResponse<200, types.CreateWorkspaceAuditLogResponse200>>;
    /**
     * Update the privacy and access settings of an object or location in the Workspace. Note
     * that sharing an item may incur charges.
     *
     * @summary Update privacy and access of an object or location
     */
    updatePrivacyAndAccess(body: types.UpdatePrivacyAndAccessBodyParam, metadata: types.UpdatePrivacyAndAccessMetadataParam): Promise<FetchResponse<200, types.UpdatePrivacyAndAccessResponse200>>;
    /**
     * This endpoint retrieves the Channels in a Workspace.
     *
     * @summary Retrieve Channels
     */
    getChatChannels(metadata: types.GetChatChannelsMetadataParam): Promise<FetchResponse<200, types.GetChatChannelsResponse200> | FetchResponse<number, types.GetChatChannelsResponseDefault>>;
    /**
     * This endpoint creates a new Channel not tied to a Space, Folder, or List. If a Channel
     * with the specified name already exists it returns it.
     *
     * @summary Create a Channel
     */
    createChatChannel(body: types.CreateChatChannelBodyParam, metadata: types.CreateChatChannelMetadataParam): Promise<FetchResponse<200, types.CreateChatChannelResponse200> | FetchResponse<201, types.CreateChatChannelResponse201> | FetchResponse<number, types.CreateChatChannelResponseDefault>>;
    /**
     * This endpoint creates a Channel and when a Channel already exists on the requested
     * location, it returns it.
     *
     * @summary Create a Channel on a Space, Folder, or List
     */
    createLocationChatChannel(body: types.CreateLocationChatChannelBodyParam, metadata: types.CreateLocationChatChannelMetadataParam): Promise<FetchResponse<200, types.CreateLocationChatChannelResponse200> | FetchResponse<201, types.CreateLocationChatChannelResponse201> | FetchResponse<number, types.CreateLocationChatChannelResponseDefault>>;
    /**
     * This endpoint creates a new Direct Message between up to 10 users. If a Direct Message
     * between those users already exists it returns it.
     *
     * @summary Create a Direct Message
     */
    createDirectMessageChatChannel(body: types.CreateDirectMessageChatChannelBodyParam, metadata: types.CreateDirectMessageChatChannelMetadataParam): Promise<FetchResponse<200, types.CreateDirectMessageChatChannelResponse200> | FetchResponse<201, types.CreateDirectMessageChatChannelResponse201> | FetchResponse<number, types.CreateDirectMessageChatChannelResponseDefault>>;
    /**
     * This endpoint retrieves a specific Channel given its ID.
     *
     * @summary Retrieves a single Channel by ID.
     * @throws FetchError<404, types.GetChatChannelResponse404> Returns when the requested {channelId} was not found.
     */
    getChatChannel(metadata: types.GetChatChannelMetadataParam): Promise<FetchResponse<200, types.GetChatChannelResponse200> | FetchResponse<number, types.GetChatChannelResponseDefault>>;
    /**
     * This endpoint updates a single Channel.
     *
     * @summary Update a Channel
     * @throws FetchError<400, types.UpdateChatChannelResponse400> Invalid update request for {channelId}.
     * @throws FetchError<404, types.UpdateChatChannelResponse404> Returns when the requested {channelId} was not found when updating a Channel
     */
    updateChatChannel(body: types.UpdateChatChannelBodyParam, metadata: types.UpdateChatChannelMetadataParam): Promise<FetchResponse<200, types.UpdateChatChannelResponse200> | FetchResponse<number, types.UpdateChatChannelResponseDefault>>;
    /**
     * This endpoint deletes a Channel. Applies to Channels tied to a Space, Folder, or List or
     * not tied to locations.
     *
     * @summary Delete a Channel
     * @throws FetchError<404, types.DeleteChatChannelResponse404> Returns when the requested {channelId} was not found when deleting a Channel
     */
    deleteChatChannel(metadata: types.DeleteChatChannelMetadataParam): Promise<FetchResponse<204, types.DeleteChatChannelResponse204> | FetchResponse<number, types.DeleteChatChannelResponseDefault>>;
    /**
     * This endpoint retrieves followers of a specific Channel given its ID.
     *
     * @summary Retrieve followers of a Channel (based on Channel ID)
     * @throws FetchError<404, types.GetChatChannelFollowersResponse404> Returns when the specified {channelId} was not found.
     */
    getChatChannelFollowers(metadata: types.GetChatChannelFollowersMetadataParam): Promise<FetchResponse<200, types.GetChatChannelFollowersResponse200> | FetchResponse<number, types.GetChatChannelFollowersResponseDefault>>;
    /**
     * This endpoint retrieves members of a specific Channel given its ID.
     *
     * @summary Retrieve members of a Channel (based on Channel ID)
     */
    getChatChannelMembers(metadata: types.GetChatChannelMembersMetadataParam): Promise<FetchResponse<200, types.GetChatChannelMembersResponse200> | FetchResponse<number, types.GetChatChannelMembersResponseDefault>>;
    /**
     * This endpoint retrieves messages for a specified Channel.
     *
     * @summary Retrieve Channel messages
     * @throws FetchError<404, types.GetChatMessagesResponse404> Returns when the specified {channelId} was not found.
     */
    getChatMessages(metadata: types.GetChatMessagesMetadataParam): Promise<FetchResponse<200, types.GetChatMessagesResponse200> | FetchResponse<number, types.GetChatMessagesResponseDefault>>;
    /**
     * This endpoint creates a top level message.
     *
     * @summary Send a message
     * @throws FetchError<404, types.CreateChatMessageResponse404> Returns when {channelId} was not found.
     */
    createChatMessage(body: types.CreateChatMessageBodyParam, metadata: types.CreateChatMessageMetadataParam): Promise<FetchResponse<201, types.CreateChatMessageResponse201> | FetchResponse<number, types.CreateChatMessageResponseDefault>>;
    /**
     * This endpoint updates a message.
     *
     * @summary Update a message
     * @throws FetchError<400, types.PatchChatMessageResponse400> Returns when the request is invalid.
     * @throws FetchError<404, types.PatchChatMessageResponse404> Returns when {messageId} was not found.
     */
    patchChatMessage(body: types.PatchChatMessageBodyParam, metadata: types.PatchChatMessageMetadataParam): Promise<FetchResponse<200, types.PatchChatMessageResponse200> | FetchResponse<number, types.PatchChatMessageResponseDefault>>;
    /**
     * This endpoint deletes a message.
     *
     * @summary Deletes a message.
     */
    deleteChatMessage(metadata: types.DeleteChatMessageMetadataParam): Promise<FetchResponse<204, types.DeleteChatMessageResponse204> | FetchResponse<number, types.DeleteChatMessageResponseDefault>>;
    /**
     * This endpoint retrieves reactions for a message
     *
     * @summary Retrieve reactions for a message
     * @throws FetchError<404, types.GetChatMessageReactionsResponse404> Returns when the specified {messageId} was not found
     */
    getChatMessageReactions(metadata: types.GetChatMessageReactionsMetadataParam): Promise<FetchResponse<200, types.GetChatMessageReactionsResponse200> | FetchResponse<number, types.GetChatMessageReactionsResponseDefault>>;
    /**
     * This endpoint creates a message reaction using lower case emoji names.
     *
     * @summary Create a message reaction
     * @throws FetchError<400, types.CreateChatReactionResponse400> Returns when the reaction {reaction} is not supported or already exists.
     * @throws FetchError<404, types.CreateChatReactionResponse404> Returns when the message {messageId} is not found.
     */
    createChatReaction(body: types.CreateChatReactionBodyParam, metadata: types.CreateChatReactionMetadataParam): Promise<FetchResponse<201, types.CreateChatReactionResponse201> | FetchResponse<number, types.CreateChatReactionResponseDefault>>;
    /**
     * This endpoint deletes a message reaction.
     *
     * @summary Delete a message reaction
     * @throws FetchError<400, types.DeleteChatReactionResponse400> Returns when the reaction {reaction} is not supported.
     * @throws FetchError<404, types.DeleteChatReactionResponse404> Returns when the message {messageId} or the reaction {reaction} is not found.
     */
    deleteChatReaction(metadata: types.DeleteChatReactionMetadataParam): Promise<FetchResponse<204, types.DeleteChatReactionResponse204> | FetchResponse<number, types.DeleteChatReactionResponseDefault>>;
    /**
     * This endpoint retrieves replies to a message.
     *
     * @summary Retrieve replies to a message
     * @throws FetchError<404, types.GetChatMessageRepliesResponse404> Returns when the specified {messageId} was not found.
     */
    getChatMessageReplies(metadata: types.GetChatMessageRepliesMetadataParam): Promise<FetchResponse<200, types.GetChatMessageRepliesResponse200> | FetchResponse<number, types.GetChatMessageRepliesResponseDefault>>;
    /**
     * This endpoint creates a reply message.
     *
     * @summary Create a reply message
     */
    createReplyMessage(body: types.CreateReplyMessageBodyParam, metadata: types.CreateReplyMessageMetadataParam): Promise<FetchResponse<201, types.CreateReplyMessageResponse201> | FetchResponse<number, types.CreateReplyMessageResponseDefault>>;
    /**
     * This endpoint retrieves tagged users for a message
     *
     * @summary Retrieve tagged users for a message
     * @throws FetchError<404, types.GetChatMessageTaggedUsersResponse404> Returns when the specified {messageId} was not found
     */
    getChatMessageTaggedUsers(metadata: types.GetChatMessageTaggedUsersMetadataParam): Promise<FetchResponse<200, types.GetChatMessageTaggedUsersResponse200> | FetchResponse<number, types.GetChatMessageTaggedUsersResponseDefault>>;
}
declare const createSDK: SDK;
export default createSDK;
