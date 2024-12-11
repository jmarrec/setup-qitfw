import * as findQtIFW from '../src/find-qtifw';
import * as installQtIFW from '../src/install-qtifw';
import {IS_WINDOWS, IS_DARWIN, IS_LINUX, ARCH} from '../src/utils';

import * as httpm from '@actions/http-client';
import * as core from '@actions/core';

import * as path from 'path';

test('Split a path', () => {
  const link =
    'http://download.qt.io/official_releases/qt-installer-framework/3.1.1/QtInstallerFramework-linux-x64.run';
  console.log(path.basename(link));
});

test('A Major is found', async () => {
  const qtifwindex: string = await findQtIFW.requestQtIndex('4.x');
  await expect(qtifwindex).toEqual('4.8.1');
});

test('A major.minor is found', async () => {
  const qtifwindex: string = await findQtIFW.requestQtIndex('4.6');
  await expect(qtifwindex).toEqual('4.6.1');
});

test('A major.minor.patch is found', async () => {
  const qtifwindex: string = await findQtIFW.requestQtIndex('4.7.0');
  await expect(qtifwindex).toEqual('4.7.0');
});

it('should test async errors', async () => {
  await expect(findQtIFW.requestQtIndex('3.178.1'))
    .rejects // At least two versions should have been found online
    .toThrow(/Invalid version given: available versions are: \d.{10,}/);
});

test('getInstallerExtension', () => {
  expect(findQtIFW.getInstallerExtension('linux')).toEqual('run');
});

test('getInstallerLinkForSpecificVersion_linux_x64_pre470', async () => {
  const link: string = await findQtIFW.getInstallerLinkForSpecificVersion(
    '4.6.1',
    'run',
    'x64'
  );
  await expect(link).toEqual(
    expect.stringContaining(
      'qt-installer-framework/4.6.1/QtInstallerFramework-linux-x64-4.6.1.run'
    )
  );
});

test('getInstallerLinkForSpecificVersion_linux_arm64_pre470', async () => {
  const link: string = await findQtIFW.getInstallerLinkForSpecificVersion(
    '4.6.1',
    'run',
    'arm'
  );
  await expect(link).toEqual(
    expect.stringContaining(
      'qt-installer-framework/4.6.1/QtInstallerFramework-linux-x64-4.6.1.run'
    )
  );
});

test('getInstallerLinkForSpecificVersion_linux_x64_post470', async () => {
  const link: string = await findQtIFW.getInstallerLinkForSpecificVersion(
    '4.7.0',
    'run',
    'x64'
  );
  await expect(link).toEqual(
    expect.stringContaining(
      'qt-installer-framework/4.7.0/QtInstallerFramework-linux-x64-4.7.0.run'
    )
  );
});

test('getInstallerLinkForSpecificVersion_linux_arm64_post470', async () => {
  const link: string = await findQtIFW.getInstallerLinkForSpecificVersion(
    '4.7.0',
    'run',
    'arm'
  );
  await expect(link).toEqual(
    expect.stringContaining(
      'qt-installer-framework/4.7.0/QtInstallerFramework-linux-arm64-4.7.0.run'
    )
  );
});

test('getInstallerLinkForSpecificVersion_mac_arm64', async () => {
  const link: string = await findQtIFW.getInstallerLinkForSpecificVersion(
    '4.7.0',
    'dmg',
    'arm'
  );
  await expect(link).toEqual(
    expect.stringContaining(
      'qt-installer-framework/4.7.0/QtInstallerFramework-macOS-x64-4.7.0.dmg'
    )
  );
});

// TODO: As of 2021-11-17, the .meta4 file appears to no longer be a simple
// metalink XML file. Rather, it ends up being the size of the package...
/*
test('Parse Meta Url', async () => {
  const originalUrl =
    'https://download.qt.io/official_releases/qt-installer-framework/4.1.1/QtInstallerFramework-linux-x64-4.1.1.run';
  const link: string = await findQtIFW.getMirrorLinkForSpecificLink(
    originalUrl
  );
  await expect(link).toMatch(/\.run/);
  await expect(link).toEqual(expect.not.stringMatching('download.qt.io'));

  const alreadyTried = [link];
  const link2: string = await findQtIFW.getMirrorLinkForSpecificLink(
    originalUrl,
    alreadyTried
  );

  await expect(link2).toMatch(/\.run/);
  await expect(link2).toEqual(expect.not.stringMatching('download.qt.io'));
  await expect(link2).toEqual(expect.not.stringContaining(link));
});
*/

/*
test('Redirects test bed', async () => {
  const url =
    'https://download.qt.io/official_releases/qt-installer-framework/4.1.1/QtInstallerFramework-linux-x64-4.1.1.run';

  const userAgent = "IT'S ME!";

  const connectionTimeout = 100;

  // Get the response headers
  const http = new httpm.HttpClient(userAgent, [], {
    allowRetries: false,
    allowRedirects: false,
    allowRedirectDowngrade: false,
    socketTimeout: connectionTimeout // miliseconds
  });

  const response: httpm.HttpClientResponse = await http.get(url);
  const statusCode = response.message.statusCode;
  if (!statusCode) {
    throw Error;
  }
  // Redirect
  if (statusCode > 300 && statusCode < 309) {
    const location = response.message.headers.location || '';
    core.error(`Asked to redirect ${statusCode} to ${location}`);
  } else {
    core.error(
      `Failed to download from "${url}". Code(${response.message.statusCode}) Message(${response.message.statusMessage})`
    );
  }
});

test('Try a fast and a slow mirror to figure out the connectionTimeOut', async () => {
  const urlPath =
    'official_releases/qt-installer-framework/4.1.1/installer-framework-opensource-src-4.1.1.tar.xz';
  const fastUrl = `http://www.mirrorservice.org/sites/download.qt-project.org/${urlPath}`;
  const slowUrl = 'https://mirrors.tuna.tsinghua.edu.cn/qt/${urlPath}';

  const userAgent = "IT'S ME!";

  const connectionTimeout = 500;

  // Get the response headers
  const http = new httpm.HttpClient(userAgent, [], {
    allowRetries: false,
    allowRedirects: false,
    allowRedirectDowngrade: false,
    socketTimeout: connectionTimeout // miliseconds
  });

  let message;
  try {
    await http.get(fastUrl);
  } catch (error) {
    message = error.message;
  }
  expect(message).toBeUndefined();

  //await expect(http.get(slowUrl)).rejects.toThrow();

  try {
    await http.get(slowUrl);
  } catch (error) {
    message = error.message;
  }
  expect(message).toMatch(/timeout/i);
});

test('Try a fast and a slow mirror with HEAD', async () => {
  const urlPath =
    'official_releases/qt-installer-framework/4.1.1/installer-framework-opensource-src-4.1.1.tar.xz';
  const fastUrl = `http://www.mirrorservice.org/sites/download.qt-project.org/${urlPath}`;
  const slowUrl = 'https://mirrors.tuna.tsinghua.edu.cn/qt/${urlPath}';

  const userAgent = "IT'S ME!";

  const connectionTimeout = 500;

  // Get the response headers
  const http = new httpm.HttpClient(userAgent, [], {
    allowRetries: false,
    allowRedirects: false,
    allowRedirectDowngrade: false,
    socketTimeout: connectionTimeout // miliseconds
  });

  let message;
  try {
    const response = await http.head(fastUrl);
    core.info(`${response.message.statusCode}, ${response.message.headers}`);
  } catch (error) {
    message = error.message;
  }
  expect(message).toBeUndefined();

  //await expect(http.get(slowUrl)).rejects.toThrow();

  try {
    const response = await http.head(slowUrl);
    core.info(`${response.message.statusCode}, ${response.message.headers}`);
  } catch (error) {
    message = error.message;
  }
  expect(message).toMatch(/timeout/i);

  const url =
    'https://download.qt.io/official_releases/qt-installer-framework/4.1.1/QtInstallerFramework-linux-x64-4.1.1.run';
  const response: httpm.HttpClientResponse = await http.head(url);
  const statusCode = response.message.statusCode;
  if (!statusCode) {
    throw Error;
  }
  // Redirect
  if (statusCode > 300 && statusCode < 309) {
    const location = response.message.headers.location || '';
    core.error(`HEAD: Asked to redirect ${statusCode} to ${location}`);
  } else {
    core.error(
      `Failed to download from "${url}". Code(${response.message.statusCode}) Message(${response.message.statusMessage})`
    );
  }
});
*/
