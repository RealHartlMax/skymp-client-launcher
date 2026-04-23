# 🤝 Contributing to SkyMP Open Launcher

First of all, thank you for your interest in this project! Every contribution is welcome.

This document provides guidelines for setting up the development environment.

## 💻 Local Development Setup

The project consists of several components. Here's how to set them up:

### 🌐 Backend (PHP & MySQL)

The backend is responsible for managing the server list.

1.  **Web Server:** We recommend using a local server environment like **XAMPP** or **WAMP**. This provides you with Apache, PHP, and MySQL/MariaDB in one package.
2.  **Database:**
    *   Use the `api-backend-php/servers.sql` file to create the necessary table structure in your MySQL database (e.g., via phpMyAdmin).
    *   Create a `config.php` file in the `api-backend-php/src/` directory to store your database credentials. Make sure this file is **never** committed to Git.
3.  **Testing:** Place the PHP files (`heartbeat.php`, `list.php`) in your web server's document root (e.g., `htdocs` in XAMPP) and use a tool like Postman or `curl` to test the API endpoints.

### 🚀 Frontend (Tauri Launcher)

The launcher is a desktop application built with Tauri, React, and TypeScript.

1.  **Rust:** Install the Rust toolchain via [rustup.rs](https://rustup.rs/). Tauri uses Rust for its backend.
2.  **Node.js & Yarn:** Install Node.js (which includes npm) and then install Yarn: `npm install -g yarn`.
3.  **Dependencies:** Navigate to the `launcher/` directory and run `yarn install` to fetch all frontend dependencies.
4.  **Run:** In the `launcher/` directory, run `yarn tauri dev` to start the launcher in development mode.

### 🎮 Client Plugin (C++)

The client plugin requires the **Skyrim Script Extender (SKSE)** headers and a C++ compiler.

1.  **Visual Studio:** Install Visual Studio with the "Desktop development with C++" workload.
2.  **SKSE:** Download the source code for the correct version of SKSE for your version of Skyrim and place the headers in the appropriate project directory.
3.  **Project Setup:** A Visual Studio project file (`.vcxproj`) will be provided in the `client-plugin/` directory (once it's created).

## ✨ Code Style

Please try to adhere to the existing code style in the project. For the frontend, we use Prettier, which should format your code automatically if you have it set up in your editor.

## 🐞 Reporting Bugs & Proposing Features

Please use the **GitHub Issues** tab to report bugs or suggest new features. Use the provided labels to categorize your issue correctly.