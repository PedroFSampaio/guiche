import type { Member } from './queue';
export type AudioPreferences = {
    voice: boolean;
    chime: boolean;
    confirmation: number;
};
export type TelevisionSession = {
    id: string;
    name: string;
    username?: string;
    approved: boolean;
    expires: number;
};
export type AuthStatus = {
    bootstrap: boolean;
    me: Member | null;
    tvPending?: boolean;
    televisions?: TelevisionSession[];
    audio?: AudioPreferences;
    error?: string;
};
