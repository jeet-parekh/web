import { WebApplication } from '@/ui_models/application';
import { ApplicationService, ApplicationEvent } from 'snjs';
export declare class ThemeManager extends ApplicationService {
    private activeThemes;
    private unsubState?;
    private unregisterDesktop;
    private unregisterComponent;
    /** @override */
    onAppLaunch(): Promise<void>;
    onAppEvent(event: ApplicationEvent): void;
    get webApplication(): WebApplication;
    deinit(): void;
    /** @override */
    onAppStart(): Promise<void>;
    private activateCachedThemes;
    private registerObservers;
    private deactivateAllThemes;
    private activateTheme;
    private deactivateTheme;
    private cacheThemes;
    private decacheThemes;
    private getCachedThemes;
}
