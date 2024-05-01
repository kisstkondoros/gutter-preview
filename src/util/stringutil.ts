export const nonNullOrEmpty = (item: string) => {
    return item != null && item.trim().length > 0;
};

export const nonHttpOnly = (item: string) => {
    return !['http', 'https'].includes(item);
};
