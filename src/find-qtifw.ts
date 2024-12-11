import * as core from '@actions/core';
import * as url from 'url';
import * as semver from 'semver';
import axios, {AxiosResponse, AxiosError} from 'axios';
import cheerio from 'cheerio';
// import {AxiosResponse, AxiosError} from 'axios'

import {
  PLATFORM,
  PLATFORM_WINDOWS,
  PLATFORM_DARWIN,
  PLATFORM_LINUX
} from './utils';

export const ROOT_QTIFW_URL =
  'https://download.qt.io/official_releases/qt-installer-framework/';

export async function requestQtIndex(
  requestedVersion: string
): Promise<string> {
  const resp = await axios
    .get(ROOT_QTIFW_URL)
    .then((response: AxiosResponse) => {
      return response.data;
    })
    .catch((error: AxiosError) => {
      // handle error
      core.error(error);
      throw `Failed request to '${ROOT_QTIFW_URL}'`;
    });

  const versions = parseQtIndex(resp);
  const maxVersion = semver.maxSatisfying(versions, requestedVersion);
  if (maxVersion == null) {
    throw new Error(
      `Invalid version given: available versions are: ${versions}`
    );
  }
  return maxVersion.version;
}

function parseQtIndex(html: string) {
  const $ = cheerio.load(html); // Load the HTML string into cheerio
  const versionTable = $('table tbody tr td a'); // Parse the HTML and extract just the links in the table rows

  const versions: semver.SemVer[] = [];
  versionTable.each((i, elem) => {
    const thisText = $(elem).text();
    const v = semver.coerce(thisText);
    if (v != null) {
      versions.push(v);
    }
  });
  // core.debug(`QtIFW Index Versions: ${versions}`)

  return versions;
}

export function getInstallerExtension(platform: string): string {
  let ext = '';
  if (platform === PLATFORM_WINDOWS) {
    ext = 'exe';
  } else if (platform === PLATFORM_DARWIN) {
    ext = 'dmg';
  } else if (platform === PLATFORM_LINUX) {
    ext = 'run';
  } else {
    throw `Unknown platform '${platform}'`;
  }
  return ext;
}

export async function getInstallerLinkForSpecificVersion(
  requestedVersion: string,
  installerExtension: string,
  arch: string
): Promise<string> {
  const qtPageUrl = `${url.resolve(ROOT_QTIFW_URL, requestedVersion)}/`;
  core.debug(`Trying to parse ${qtPageUrl}`);

  let installerLink = '';

  const linux_has_arm64: boolean = semver.gte(requestedVersion, '4.7.0');
  const windows_has_arm64: boolean = semver.gte(requestedVersion, '4.8.1');

  await axios
    .get(qtPageUrl)
    .then((response: AxiosResponse) => {
      const $ = cheerio.load(response.data); // Load the HTML string into cheerio
      const versionTable = $('table tbody tr td a'); // Parse the HTML and extract just the links in the table rows

      versionTable.each((i, elem) => {
        const thisLink = $(elem).attr('href');
        if (
          thisLink &&
          thisLink.endsWith(installerExtension) &&
          (installerExtension != 'run' ||
            !linux_has_arm64 ||
            thisLink.includes(arch)) &&
          (installerExtension != 'exe' ||
            !windows_has_arm64 ||
            thisLink.includes(arch))
        ) {
          installerLink = url.resolve(qtPageUrl, thisLink);
        }
      });
    })
    .catch((error: AxiosError) => {
      // handle error
      core.error(error);
      throw `Failed request to '${qtPageUrl}'`;
    });

  if (installerLink == null) {
    throw `Couldn't locate specific installer for version '${requestedVersion}' and extension '${installerExtension}'`;
  }
  core.info(`Original installerLink=${installerLink}`);

  return installerLink;
}

interface IMirror {
  priority: number;
  url: string;
}

function filterOutUrl(url: string, alreadyTriedUrls?: string[]): boolean {
  if (alreadyTriedUrls === undefined) {
    return false;
  }

  let isUrlBlackListed: boolean = false;

  alreadyTriedUrls.forEach(blacklisted => {
    core.debug(`url=${url}, blacklisted=${blacklisted}`);
    if (url.toLowerCase().includes(blacklisted.toLowerCase())) {
      isUrlBlackListed = true;
      return;
    }
  });

  return isUrlBlackListed;
}

function isUrlBlackListed(url: string): boolean {
  const blacklisteds = [
    'mirrors.ocf.berkeley.edu',
    'mirrors.ustc.edu.cn',
    'mirrors.tuna.tsinghua.edu.cn',
    'mirrors.geekpie.club'
  ];

  return filterOutUrl(url, blacklisteds);
}

export async function getMirrorLinkForSpecificLink(
  originalUrl: string,
  alreadyTriedUrls?: string[]
): Promise<string> {
  const metaUrl = `${originalUrl}.meta4`;
  core.debug(`Trying to parse Meta4 file at ${metaUrl}`);

  let mirrors: IMirror[] = [];

  await axios
    .get(metaUrl)
    .then((response: AxiosResponse) => {
      const $ = cheerio.load(response.data, {
        normalizeWhitespace: true,
        xmlMode: true
      }); // Load the HTML string into cheerio

      // const mirorrurls = $('urn\\:ietf\\:params\\:xml\\:ns\\:metalink\\:url[@priority]');
      const mirorrurls = $('*url');

      mirorrurls.each((i, elem) => {
        const thisLink = $(elem).text();
        const thisPriority = $(elem).attr('priority');
        if (thisLink && thisPriority) {
          core.debug(`${thisPriority}, ${thisLink}`);
          if (isUrlBlackListed(thisLink)) {
            core.debug(`${thisLink} is blacklisted`);
          } else if (filterOutUrl(thisLink, alreadyTriedUrls)) {
            core.debug(`${thisLink} was already tried`);
          } else {
            mirrors.push({
              priority: +thisPriority,
              url: thisLink
            });
          }
        }
      });
    })
    .catch((error: AxiosError) => {
      // handle error
      core.error(error);
      throw `Failed request to '${metaUrl}'`;
    });

  if (mirrors.length == 0) {
    throw `Couldn't locate a single mirror on '${metaUrl}'`;
  }

  return mirrors.sort((a, b) => a.priority - b.priority)[0].url;
}
