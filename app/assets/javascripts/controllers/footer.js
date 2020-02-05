import { dateToLocalizedString } from '@/utils';
import { 
  ApplicationEvents, 
  TIMING_STRATEGY_FORCE_SPAWN_NEW,
  ProtectedActions
} from 'snjs';
import template from '%/footer.pug';
import {
  APP_STATE_EVENT_EDITOR_FOCUSED,
  APP_STATE_EVENT_BEGAN_BACKUP_DOWNLOAD,
  APP_STATE_EVENT_ENDED_BACKUP_DOWNLOAD,
  EVENT_SOURCE_USER_INTERACTION
} from '@/state';
import {
  STRING_GENERIC_SYNC_ERROR,
  STRING_NEW_UPDATE_READY
} from '@/strings';

class FooterCtrl {

  /* @ngInject */
  constructor(
    $rootScope,
    $timeout,
    appState,
    application,
    nativeExtManager,
    statusManager,
    godService
  ) {
    this.$rootScope = $rootScope;
    this.$timeout = $timeout;
    this.application = application;
    this.appState = appState;
    this.nativeExtManager = nativeExtManager;
    this.statusManager = statusManager;
    this.godService = godService;

    this.rooms = [];
    this.themesWithIcons = [];
    this.showSyncResolution = false;

    this.addAppStateObserver();
    this.updateOfflineStatus();
    this.addAppEventObserver();
    this.findErrors();
    this.streamItems();
    this.registerComponentHandler();
    this.addRootScopeListeners();

    this.godService.checkForSecurityUpdate().then((available) => {
      this.securityUpdateAvailable = available;
    });
    this.statusManager.addStatusObserver((string) => {
      this.$timeout(() => {
        this.arbitraryStatusMessage = string;
      });
    });
  }

  addRootScopeListeners() {
    this.$rootScope.$on("security-update-status-changed", () => {
      this.securityUpdateAvailable = this.godService.securityUpdateAvailable;
    });
    this.$rootScope.$on("reload-ext-data", () => {
      this.reloadExtendedData();
    });
    this.$rootScope.$on("new-update-available", () => {
      this.$timeout(() => {
        this.onNewUpdateAvailable();
      });
    });
  }

  addAppStateObserver() {
    this.appState.addObserver((eventName, data) => {
      if(eventName === APP_STATE_EVENT_EDITOR_FOCUSED) {
        if (data.eventSource === EVENT_SOURCE_USER_INTERACTION) {
          this.closeAllRooms();
          this.closeAccountMenu();
        }
      } else if(eventName === APP_STATE_EVENT_BEGAN_BACKUP_DOWNLOAD) {
        this.backupStatus = this.statusManager.addStatusFromString(
          "Saving local backup..."
        );
      } else if(eventName === APP_STATE_EVENT_ENDED_BACKUP_DOWNLOAD) {
        if(data.success) {
          this.backupStatus = this.statusManager.replaceStatusWithString(
            this.backupStatus,
            "Successfully saved backup."
          );
        } else {
          this.backupStatus = this.statusManager.replaceStatusWithString(
            this.backupStatus,
            "Unable to save local backup."
          );
        }
        this.$timeout(() => {
          this.backupStatus = this.statusManager.removeStatus(this.backupStatus);
        }, 2000);
      }
    });
  }

  addAppEventObserver() {
    this.application.addEventHandler((eventName) => {
      if (eventName === ApplicationEvents.LoadedLocalData) {
        if(this.offline && this.application.getNoteCount() === 0) {
          this.showAccountMenu = true;
        }
      } else if (eventName === ApplicationEvents.EnteredOutOfSync) {
        this.outOfSync = true;
    } else if (eventName === ApplicationEvents.ExitedOutOfSync) {
        this.outOfSync = false;
    } else if (eventName === ApplicationEvents.CompletedSync) {
        this.syncUpdated();
        this.findErrors();
        this.updateOfflineStatus();
    } else if (eventName === ApplicationEvents.FailedSync) {
        this.findErrors();
        this.updateOfflineStatus();
      }
    });
  }

  streamItems() {
    this.application.streamItems({
      contentType: CONTENT_TYPE_COMPONENT,
      stream: async () => {
        this.rooms = this.application.getItems({
          contentType: CONTENT_TYPE_COMPONENT
        }).filter((candidate) => {
          return candidate.area === 'rooms' && !candidate.deleted;
        });
        if(this.queueExtReload) {
          this.queueExtReload = false;
          this.reloadExtendedData();
        }
      }
    });

    this.application.streamItems({
      contentType: 'SN|Theme',
      stream: async () => {
        const themes = this.application.getDisplayableItems({
          contentType: CONTENT_TYPE_THEME
        }).filter((candidate) => {
          return (
            !candidate.deleted &&
            candidate.content.package_info &&
            candidate.content.package_info.dock_icon
          );
        }).sort((a, b) => {
          return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
        });
        const differ = themes.length !== this.themesWithIcons.length;
        this.themesWithIcons = themes;
        if(differ) {
          this.reloadDockShortcuts();
        }
      }
    );
  }

  registerComponentHandler() {
    this.application.componentManager.registerHandler({
      identifier: "roomBar",
      areas: ["rooms", "modal"],
      activationHandler: (component) => {},
      actionHandler: (component, action, data) => {
        if(action === "set-size") {
          component.setLastSize(data);
        }
      },
      focusHandler: (component, focused) => {
        if(component.isEditor() && focused) {
          this.closeAllRooms();
          this.closeAccountMenu();
        }
      }
    });
  }

  reloadExtendedData() {
    if(this.reloadInProgress) {
      return;
    }
    this.reloadInProgress = true;

    /**
     * A reload consists of opening the extensions manager,
     * then closing it after a short delay.
     */
    const extWindow = this.rooms.find((room) => {
      return room.package_info.identifier === this.nativeExtManager.extManagerId;
    });
    if(!extWindow) {
      this.queueExtReload = true;
      this.reloadInProgress = false;
      return;
    }
    this.selectRoom(extWindow);
    this.$timeout(() => {
      this.selectRoom(extWindow);
      this.reloadInProgress = false;
      this.$rootScope.$broadcast('ext-reload-complete');
    }, 2000);
  }

  getUser() {
    return this.application.getUser();
  }

  updateOfflineStatus() {
    this.offline = this.application.noUser();
  }

  openSecurityUpdate() {
    this.godService.presentPasswordWizard('upgrade-security');
  }

  findErrors() {
    this.error = this.application.getSyncStatus().error;
  }

  accountMenuPressed() {
    this.showAccountMenu = !this.showAccountMenu;
    this.closeAllRooms();
  }

  toggleSyncResolutionMenu = () => {
    this.showSyncResolution = !this.showSyncResolution;
  }

  closeAccountMenu = () => {
    this.showAccountMenu = false;
  }

  hasPasscode() {
    return this.application.hasPasscode();
  }

  lockApp() {
    this.$rootScope.lockApplication();
  }

  refreshData() {
    this.isRefreshing = true;
    this.application.sync({
      timingStrategy: TIMING_STRATEGY_FORCE_SPAWN_NEW,
      checkIntegrity: true
    }).then((response) => {
      this.$timeout(() => {
        this.isRefreshing = false;
      }, 200);
      if(response && response.error) {
        this.application.alertManager.alert({
          text: STRING_GENERIC_SYNC_ERROR
        });
      } else {
        this.syncUpdated();
      }
    });
  }

  syncUpdated() {
    this.lastSyncDate = dateToLocalizedString(new Date());
  }

  onNewUpdateAvailable() {
    this.newUpdateAvailable = true;
  }

  clickedNewUpdateAnnouncement() {
    this.newUpdateAvailable = false;
    this.application.alertManager.alert({
      text: STRING_NEW_UPDATE_READY
    });
  }

  reloadDockShortcuts() {
    const shortcuts = [];
    for(const theme of this.themesWithIcons) {
      const name = theme.content.package_info.name;
      const icon = theme.content.package_info.dock_icon;
      if(!icon) {
        continue;
      }
      shortcuts.push({
        name: name,
        component: theme,
        icon: icon
      });
    }

    this.dockShortcuts = shortcuts.sort((a, b) => {
      /** Circles first, then images */
      const aType = a.icon.type;
      const bType = b.icon.type;
      if(aType === bType) {
        return 0;
      } else if(aType === 'circle' && bType === 'svg') {
        return -1;
      } else if(bType === 'circle' && aType === 'svg') {
        return 1;
      }
    });
  }

  initSvgForShortcut(shortcut) {
    const id = 'dock-svg-' + shortcut.component.uuid;
    const element = document.getElementById(id);
    const parser = new DOMParser();
    const svg = shortcut.component.content.package_info.dock_icon.source;
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    element.appendChild(doc.documentElement);
  }

  selectShortcut(shortcut) {
    this.application.componentManager.toggleComponent(shortcut.component);
  }

  onRoomDismiss(room) {
    room.showRoom = false;
  }

  closeAllRooms() {
    for(const room of this.rooms) {
      room.showRoom = false;
    }
  }

  async selectRoom(room) {
    const run = () => {
      this.$timeout(() => {
        room.showRoom = !room.showRoom;
      });
    };

    if(!room.showRoom) {
      const requiresPrivilege = await this.application.privilegesManager.actionRequiresPrivilege(
        ProtectedActions.ManageExtensions
      );
      if(requiresPrivilege) {
        this.godService.presentPrivilegesModal(
          ProtectedActions.ManageExtensions,
          run
        );
      } else {
        run();
      }
    } else {
      run();
    }
  }

  clickOutsideAccountMenu() {
    if(this.application.privilegesManager.authenticationInProgress()) {
      return;
    }
    this.showAccountMenu = false;
  }
}

export class Footer {
  constructor() {
    this.restrict = 'E';
    this.scope = {};
    this.template = template;
    this.controller = FooterCtrl;
    this.replace = true;
    this.controllerAs = 'ctrl';
    this.bindToController = true;
  }
}