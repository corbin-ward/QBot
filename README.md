# Meet QBot! Your server's pickup game solution.

## Add QBot with the Link Below

**QBot Invite Link**: https://discord.com/oauth2/authorize?client_id=1255730784275398717

---

## Overview

**QBot** is a Discord bot designed to manage and organize queues within a server. It allows users to create queues for different activities (e.g., games, events), manage those queues by adding or removing users, and utilize templates for queue creation to streamline the process. The bot supports various queue management features such as setting ready-up timers, handling waitlists, and automating the movement of users between different states within the queue.

---

## Getting Started with QBot

To get started with QBot, follow these steps:

1. **Invite QBot to Your Server**:
   - Open the invite link for QBot (https://discord.com/oauth2/authorize?client_id=1255730784275398717) and invite it to your Discord server. Ensure QBot has the necessary permissions (e.g. send messages).

2. **Initialize QBot**:
   - Once QBot is in your server, it will automatically load any pre-existing queue data from its database. It will be ready to use after it has finished loading.

3. **Load or Create Templates**:
   - **Loading Templates**: QBot comes with pre-created templates that you can use to quickly set up queues for common games or activities. To use these templates, you must first load them into your server. Use the `/template load` command to do this. Without loading these templates, they won't be available for queue creation.
   - **Creating Templates**: If you want to create your own custom templates, use the `/template create` command. After creating a template, you still need to load it into your server using `/template load` before it can be used to create queues.

4. **Create a Queue**:
   - You can create a new queue by using either a pre-loaded template or manually entering queue details. Use the `/queue` command to get started. Ensure the template you want to use is loaded into your server.

5. **Users Join:**:
   - Users can join simply by clicking the 'Join' button under your queue. Note that you can only create one queue at a time.

---

## QBot Commands

QBot comes with several commands that allow you to interact with and manage queues. Below is a detailed explanation of each command and how to use it.

### `/queue` Command

The `/queue` command is the primary way to create and manage queues. It has several subcommands:

- **`/queue new`**:  
  Create a new queue using a pre-existing template.
  - **Usage**: `/queue new [template-id] [time] [timezone]`
  - **Options**:
    - `template-id`: Select the template you want to use.
    - `time`: Specify the time for the queue to start.
    - `timezone`: Specify your timezone for the queue.

- **`/queue manual`**:  
  Manually create a queue by specifying all details.
  - **Usage**: `/queue manual [name] [queue-spots] [waitlist-spots] [time] [timezone]`
  - **Options**:
    - `name`: The name of the queue (e.g., the game name).
    - `queue-spots`: Number of spots available in the queue.
    - `waitlist-spots`: Number of spots available on the waitlist.
    - `time`: The time when the queue will start.
    - `timezone`: Your timezone.

- **`/queue kick`**:  
  Remove a user from the queue or waitlist.
  - **Usage**: `/queue kick [user]`
  - **Options**:
    - `user`: The user to be removed from the queue or waitlist.

### `/template` Command

The `/template` command allows you to manage queue templates, making it easier to create queues quickly using predefined settings.

- **`/template create`**:  
  Create a new template that can be used in any server with QBot.
  - **Usage**: `/template create [name] [thumbnail] [queue-spots] [waitlist-spots]`
  - **Options**:
    - `name`: The name of the queue template.
    - `thumbnail`: An image to represent the queue.
    - `queue-spots`: Number of spots in the queue.
    - `waitlist-spots`: Number of spots in the waitlist.

- **`/template delete`**:  
  Delete a template you have created from all servers with QBot.
  - **Usage**: `/template delete [template-id]`
  - **Options**:
    - `template-id`: The ID of the template to delete.

- **`/template load`**:  
  Load a template into your server.
  - **Usage**: `/template load [template-id]`
  - **Options**:
    - `template-id`: The ID of the template to load.

- **`/template remove`**:  
  Remove a template from your server.
  - **Usage**: `/template remove [template-id]`
  - **Options**:
    - `template-id`: The ID of the template to remove.

---

## Command Breakdown and Usage

### `/queue new`

This command is used to create a new queue based on an existing template. The template will automatically populate the queue's details (name, number of spots, etc.). You only need to specify the start time and timezone. This is ideal for recurring activities where the details remain consistent.

### `/queue manual`

This command allows for more flexibility by letting you manually define every aspect of the queue. You can use this when you don't have a suitable template available or if you need a queue with unique settings that aren't covered by your templates.

### `/queue kick`

Use this command to manage the participants in your queue. It allows you to remove users who may no longer be participating or who were added by mistake.

### `/template create`

This command is useful for creating templates that can be reused across different servers. When creating a template, you can specify the name, thumbnail, and the number of spots in both the main queue and the waitlist.

### `/template delete`

This command is for removing templates from QBot’s storage. Once deleted, the template will no longer be available for use in any server.

### `/template load`

Use this command to load a template into your server, making it available for creating new queues. Loading templates helps to quickly set up queues with predefined settings.

### `/template remove`

This command removes a template from your server without deleting it from QBot’s storage. This is useful when a template is no longer needed in a particular server but might still be useful elsewhere.

---

## Bugs/Issues

QBot is in beta, so if you find any bugs please report them on the issues page on GitHub (https://github.com/corbin-ward/QBot/issues).