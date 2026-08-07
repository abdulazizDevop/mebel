export interface ColorVariant {
    hex: string;
    image: string;
    name?: string;
    photos?: string[];
}
export interface Product {
    id: string;
    name: string;
    sku: string;
    price: number;
    purchasePrice?: number;
    image: string;
    category: string;
    description: string;
    dimensions?: string;
    weight?: string;
    material?: string;
    color?: 'terracotta' | 'mustard' | 'primary';
    colorVariants: ColorVariant[];
    inStock?: boolean;
    quantity?: number;
}
export declare const categories: string[];
export declare const products: Product[];
