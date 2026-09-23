/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import "./checkNodeVersion.js";

import { execFileSync, execSync } from "child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from "fs";
import { release } from "os";
import { dirname, join } from "path";
import { Readable } from "stream";
import { finished } from "stream/promises";
import { fileURLToPath } from "url";

const BASE_URL = "https://github.com/Vencord/Installer/releases/latest/download/";

const IS_WSL = process.platform === "linux"
    && (existsSync("/proc/sys/fs/binfmt_misc/WSLInterop") || /microsoft/i.test(release()));
const TARGET_WINDOWS = IS_WSL && process.env.VENCORD_WSL_NATIVE !== "1";

const BASE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE_DIR = join(BASE_DIR, "dist", "Installer");
const ETAG_FILE = join(FILE_DIR, "etag.txt");

function getFilename() {
    if (TARGET_WINDOWS) return "VencordInstallerCli.exe";

    switch (process.platform) {
        case "win32":
            return "VencordInstallerCli.exe";
        case "darwin":
            return "VencordInstallerCli-darwin";
        case "linux":
            return "VencordInstallerCli-linux";
        default:
            throw new Error("Unsupported platform: " + process.platform);
    }
}

async function ensureBinary() {
    const filename = getFilename();
    console.log("Downloading " + filename);

    mkdirSync(FILE_DIR, { recursive: true });

    const outputFile = join(FILE_DIR, filename);

    const etag = existsSync(outputFile) && existsSync(ETAG_FILE)
        ? readFileSync(ETAG_FILE, "utf-8")
        : null;

    const res = await fetch(BASE_URL + filename, {
        headers: {
            "User-Agent": "Vencord (https://github.com/Vendicated/Vencord)",
            "If-None-Match": etag
        }
    });

    if (res.status === 304) {
        console.log("Up to date, not redownloading!");
        return outputFile;
    }
    if (!res.ok)
        throw new Error(`Failed to download installer: ${res.status} ${res.statusText}`);

    writeFileSync(ETAG_FILE, res.headers.get("etag"));

    const body = Readable.fromWeb(res.body);
    await finished(body.pipe(createWriteStream(outputFile, {
        mode: 0o755,
        autoClose: true
    })));

    console.log("Finished downloading!");

    return outputFile;
}



function toWindowsPath(path) {
    const winPath = execFileSync("wslpath", ["-w", path], { encoding: "utf-8" }).trim();
    if (!winPath)
        throw new Error(`wslpath failed to convert ${path} to a Windows path`);
    return winPath;
}

const installerBin = await ensureBinary();

const userDataDir = TARGET_WINDOWS ? toWindowsPath(BASE_DIR) : BASE_DIR;

if (TARGET_WINDOWS) {
    console.log("Detected WSL, targeting the Windows Discord install");
    console.log("Using user data dir " + userDataDir);
    if (userDataDir.startsWith("\\\\"))
        console.log("This repo lives on the WSL filesystem, so Discord will load Vencord over \\\\wsl.localhost and needs WSL running. Cloning under /mnt/c avoids that.");
    console.log("Set VENCORD_WSL_NATIVE=1 to install into a Discord running inside WSL instead.");
}

console.log("Now running Installer...");

const argStart = process.argv.indexOf("--");
const args = argStart === -1 ? [] : process.argv.slice(argStart + 1);

try {
    execFileSync(installerBin, args, {
        stdio: "inherit",
        env: {
            ...process.env,
            VENCORD_USER_DATA_DIR: userDataDir,
            VENCORD_DEV_INSTALL: "1"
        }
    });
} catch {
    console.error("Something went wrong. Please check the logs above.");
}
