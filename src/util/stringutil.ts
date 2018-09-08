export const nonNullOrEmpty = (item: string) => {
    return item != null && item.trim().length > 0;
};
