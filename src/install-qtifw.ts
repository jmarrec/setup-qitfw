import fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as exec from '@actions/exec';
import {getMirrorLinkForSpecificLink} from './find-qtifw';
import {v4 as uuidV4} from 'uuid';
import {ExecOptions} from '@actions/exec/lib/interfaces';

import {IS_DARWIN, IS_LINUX, QT_IFW_INSTALL_SCRIPT_QS} from './utils';

export function getWorkingQtIFWWorkingDirectory() {
  let qtIFWPathDestDir: string;
  if (process.env['QT_IFW_WORKING_DIR']) {
    qtIFWPathDestDir = process.env['QT_IFW_WORKING_DIR'];
  } else {
    qtIFWPathDestDir = path.join(process.cwd(), '.tmp/');
    if (process.env['RUNNER_TEMP']) {
      qtIFWPathDestDir = path.join(process.env['RUNNER_TEMP'], uuidV4());
    }
  }

  process.env['QT_IFW_WORKING_DIR'] = qtIFWPathDestDir;
  core.debug(`Working Directory: ${qtIFWPathDestDir}`);
  return qtIFWPathDestDir;
}

export async function installQtIFW(downloadUrl: string) {
  core.info(`Download from "${downloadUrl}"`);

  const qtIFWPathDestDir = getWorkingQtIFWWorkingDirectory();
  const qtIFWPathDest = path.join(qtIFWPathDestDir, path.basename(downloadUrl));

  let qtIFWPath: string = '';
  if (fs.existsSync(qtIFWPathDest)) {
    core.info(`File already exists at ${qtIFWPathDest}`);
    qtIFWPath = qtIFWPathDest;
  } else {
    try {
      qtIFWPath = await tc.downloadTool(downloadUrl, qtIFWPathDest);
    } catch (error: any) {
      core.warning(
        `Initial download failed '${downloadUrl}' with error: ${error.message}`
      );
      downloadUrl = await getMirrorLinkForSpecificLink(downloadUrl);
      core.info(`Selected mirror '${downloadUrl}'`);
      qtIFWPath = await tc.downloadTool(downloadUrl, qtIFWPathDest);
    }

    core.info(`Downloaded installer at "${qtIFWPath}"`);
  }
  core.debug(`qtIFWPathDest=${qtIFWPathDest}`);

  core.info(`Execute installer at ${qtIFWPath}`);
  try {
    await runInstallQtIFW(qtIFWPath);
  } catch (error: any) {
    core.error(`ERROR: ${error.message}`);
  }
}

async function runInstallQtIFW(qtIFWPath: string) {
  const workingDirectory = path.dirname(qtIFWPath);
  let exeName = path.basename(qtIFWPath);
  core.info(
    `qtIFWPath=${qtIFWPath}, workingDirectory=${workingDirectory}, exeName=${exeName}`
  );

  const scriptName = 'install_script_qtifw.qs';

  const options: ExecOptions = {
    cwd: workingDirectory,
    silent: true,
    listeners: {
      stdout: (data: Buffer) => {
        core.info(data.toString().trim());
      },
      stderr: (data: Buffer) => {
        core.error(data.toString().trim());
      }
    }
  };

  await exec.exec(
    'bash',
    ['-noprofile', '--norc', '-eo', 'pipefail', '-c', 'ls -la'],
    options
  );

  // TODO: remove? Since 4.0.0, you can use the CLI feature rather than the
  // install script
  // const qsPath = path.join(workingDirectory, scriptName);
  // fs.writeFileSync(qsPath, QT_IFW_INSTALL_SCRIPT_QS);

  let platformOpts: string = '';

  if (IS_DARWIN) {
    // This is very annoying... but we need to mount the DMG first...
    // hdiutil attach -mountpoint ./qtifw_installer QtInstallerFramework-mac-x64.dmg
    // sudo ./qtifw_installer/QtInstallerFramework-mac-x64.app/Contents/MacOS/QtInstallerFramework-mac-x64 --verbose --script ./ci/install_script_qtifw.qs

    await exec.exec(
      'bash',
      [
        '-noprofile',
        '--norc',
        '-eo',
        'pipefail',
        '-c',
        `hdiutil attach -mountpoint ./qtifw_installer "${qtIFWPath}"`
      ],
      options
    );
    core.debug('ls ./qtifw_installer/');
    await exec.exec('bash', ['-c', 'ls ./qtifw_installer/'], options);
    core.debug(
      `ls ./qtifw_installer/${exeName.replace(
        '.dmg',
        '.app'
      )}/Contents/MacOS/${exeName.replace('.dmg', '')}/`
    );
    await exec.exec(
      'bash',
      [
        '-c',
        `ls ./qtifw_installer/${exeName.replace(
          '.dmg',
          '.app'
        )}/Contents/MacOS/`
      ],
      options
    );

    qtIFWPath = path.join(
      workingDirectory,
      `qtifw_installer/${exeName.replace('.dmg', '.app')}/Contents/MacOS/`
    );

    exeName = `qtifw_installer/${exeName.replace(
      '.dmg',
      '.app'
    )}/Contents/MacOS/${exeName.replace('.dmg', '')}`;
    // Not supported on macOS: platformOpts = '--platform minimal';
  } else if (IS_LINUX) {
    // Chmod +x the .run file
    core.info('Chmod +x');
    fs.chmodSync(qtIFWPath, '0755');
  }
  core.debug('Will try to run the installer now');
  const installDir = path.join(workingDirectory, 'install');

  try {
    core.debug(
      `${qtIFWPath} --accept-licenses --default-answer --confirm-command --root ${installDir} install`
    );
    const return_code = await exec.exec(
      'bash',
      [
        '-noprofile',
        '--norc',
        '-eo',
        'pipefail',
        '-c',
        `./${exeName} --accept-licenses --default-answer --confirm-command --root $(pwd)/install install`
      ],
      options
    );
    if (return_code != 0) {
      throw 'Something went wrong during the installation';
    }
  } catch (error: any) {
    throw `Something went wrong during the installation: ${error.message}`;
  }

  if (IS_DARWIN) {
    // Unmount
    await exec.exec(
      'bash',
      [
        '-noprofile',
        '--norc',
        '-eo',
        'pipefail',
        '-c',
        'hdiutil detach ./qtifw_installer -force'
      ],
      options
    );
  }

  const binDir = path.join(installDir, 'bin');
  core.info(`Adding '${binDir}' to PATH`);
  core.setOutput('qtifw-bin-dir', binDir);
  core.addPath(binDir);
}

export async function installRequiredSystemDeps() {
  if (process.env['GITHUB_ACTIONS']) {
    if (IS_LINUX) {
      core.info('Running apt-get update');
      await exec.exec('sudo', ['apt-get', 'update'], {silent: true});

      core.info(
        'Installing required system libraries: libxkbcommon-x11-0 xorg-dev libgl1-mesa-dev libxcb-icccm4-dev libxcb-image0-dev libxcb-keysyms1-dev libxcb-render-util0-dev libxcb-xinerama0-dev libxcb-randr0-dev libxcb-shape0'
      );

      await exec.exec(
        'sudo',
        [
          'apt-get',
          '-y',
          'install',
          'libxkbcommon-x11-0',
          'xorg-dev',
          'libgl1-mesa-dev',
          'libxcb-icccm4-dev',
          'libxcb-image0-dev',
          'libxcb-keysyms1-dev',
          'libxcb-render-util0-dev',
          'libxcb-xinerama0-dev',
          'libxcb-randr0-dev',
          'libxcb-shape0'
        ],
        {silent: true}
      );
    }
  }
}
