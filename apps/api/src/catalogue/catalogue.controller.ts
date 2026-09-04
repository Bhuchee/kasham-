import { BadRequestException, Controller, Get, Post, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';

// Timeout fetch wrapper using AbortController
async function fetchWithTimeout(url: string, options: any = {}, timeoutMs = 1500): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

/**
 * Re-uploads a third-party image URL to our Cloudinary account.
 * Runs as a fire-and-forget background task — never blocks the response.
 * Updates the CatalogueProduct row with the new Cloudinary URL on success.
 */
async function reuploadToCloudinary(
  prisma: PrismaService,
  barcode: string,
  thirdPartyUrl: string
): Promise<void> {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      console.warn('[Cloudinary] Missing env vars — skipping background re-upload');
      return;
    }

    // Build signed upload using Cloudinary REST API (upload via URL)
    const timestamp = Math.round(Date.now() / 1000);
    const folder = 'chobo';

    // Generate signature
    const crypto = await import('crypto');
    const paramsToSign = `folder=${folder}&timestamp=${timestamp}&upload_preset=chobo_server`;
    const signature = crypto
      .createHash('sha1')
      .update(paramsToSign + apiSecret)
      .digest('hex');

    const formData = new URLSearchParams();
    formData.append('file', thirdPartyUrl);
    formData.append('upload_preset', 'chobo_server');
    formData.append('folder', folder);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp.toString());
    formData.append('signature', signature);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Cloudinary] Upload failed for barcode ${barcode}:`, errText);
      return;
    }

    const data = await res.json() as any;
    if (data.secure_url) {
      // Update the Neon Postgres record with our CDN URL
      await prisma.catalogueProduct.update({
        where: { barcode },
        data: { imageUrl: data.secure_url },
      });
      console.log(`[Cloudinary] ✅ Image migrated for ${barcode}: ${data.secure_url}`);
    }
  } catch (err: any) {
    console.error(`[Cloudinary] Background upload error for ${barcode}:`, err.message);
  }
}

/** Returns true if the URL is already on Cloudinary */
function isCloudinaryUrl(url: string | null | undefined): boolean {
  return !!url && (url.includes('res.cloudinary.com') || url.includes('cloudinary.com'));
}

// 1. Open Food Facts Broker
async function fetchOFF(barcode: string) {
  try {
    const res = await fetchWithTimeout(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.status === 1 && data.product) {
        const prod = data.product;
        return {
          name: prod.product_name || prod.product_name_en || '',
          brand: prod.brands || null,
          imageUrl: prod.image_url || null,
          category: prod.categories || null,
        };
      }
    }
  } catch (e: any) {
    console.error(`[OFF] lookup error for ${barcode}:`, e.message);
  }
  return null;
}

// 2. UPCItemDB Broker
async function fetchUPC(barcode: string) {
  try {
    const res = await fetchWithTimeout(`https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.items && data.items.length > 0) {
        const item = data.items[0];
        return {
          name: item.title || '',
          brand: item.brand || null,
          imageUrl: (item.images && item.images.length > 0) ? item.images[0] : null,
          category: item.category || null,
        };
      }
    }
  } catch (e: any) {
    console.error(`[UPCItemDB] lookup error for ${barcode}:`, e.message);
  }
  return null;
}

// 3. openFDA Broker for medicines
async function fetchFDA(barcode: string) {
  try {
    // Search the NDC directory by barcode/NDC code
    const res = await fetchWithTimeout(
      `https://api.fda.gov/drug/ndc.json?search=package_ndc:"${barcode}"+OR+product_ndc:"${barcode}"`
    );
    if (res.ok) {
      const data = await res.json();
      if (data && data.results && data.results.length > 0) {
        const result = data.results[0];
        return {
          name: result.brand_name || result.generic_name || '',
          brand: result.labeler_name || null,
          imageUrl: null,
          category: 'Pharmacy', // Direct pharmaceutical classification
        };
      }
    }
  } catch (e: any) {
    console.error(`[openFDA] lookup error for ${barcode}:`, e.message);
  }
  return null;
}

// Normalizer to map raw category strings to client presets
function normalizeCategory(rawCategory: string | null): string {
  if (!rawCategory) return 'Provisions';
  const raw = rawCategory.toLowerCase();
  if (raw.includes('beverage') || raw.includes('drink') || raw.includes('soda') || raw.includes('water') || raw.includes('juice')) {
    return 'Beverages';
  }
  if (
    raw.includes('snack') || 
    raw.includes('cookie') || 
    raw.includes('chocolate') || 
    raw.includes('candy') || 
    raw.includes('sweet') || 
    raw.includes('chip') || 
    raw.includes('biscuit')
  ) {
    return 'Snacks';
  }
  if (
    raw.includes('pharmacy') || 
    raw.includes('medicine') || 
    raw.includes('drug') || 
    raw.includes('health') || 
    raw.includes('pill') || 
    raw.includes('tablet')
  ) {
    return 'Pharmacy';
  }
  if (
    raw.includes('clothing') || 
    raw.includes('apparel') || 
    raw.includes('garment') || 
    raw.includes('shirt') || 
    raw.includes('shoe') || 
    raw.includes('pants') || 
    raw.includes('clothes')
  ) {
    return 'Clothes';
  }
  if (
    raw.includes('electronic') || 
    raw.includes('device') || 
    raw.includes('phone') || 
    raw.includes('computer') || 
    raw.includes('accessory') || 
    raw.includes('cable')
  ) {
    return 'Electronics';
  }
  if (
    raw.includes('food') || 
    raw.includes('fresh') || 
    raw.includes('fruit') || 
    raw.includes('vegetable') || 
    raw.includes('meat') || 
    raw.includes('grocery') || 
    raw.includes('produce')
  ) {
    return 'Fresh Food';
  }
  return 'Provisions';
}

// Lookup/search stay public — this is a shared, non-sensitive barcode
// database. Only the write path (contribute) requires auth.
@Controller('catalogue')
export class CatalogueController {
  constructor(private prisma: PrismaService) {}

  @Get('lookup/:barcode')
  async lookupByBarcode(@Param('barcode') barcode: string) {
    // 1. Check local catalog cache first
    const cached = await this.prisma.catalogueProduct.findUnique({
      where: { barcode },
    });
    if (cached) {
      // If cached image is still a third-party URL, kick off background migration
      if (cached.imageUrl && !isCloudinaryUrl(cached.imageUrl)) {
        setImmediate(() => reuploadToCloudinary(this.prisma, barcode, cached.imageUrl!));
      }
      return {
        ...cached,
        category: normalizeCategory(cached.category),
      };
    }

    // 2. Fetch in parallel from Open Food Facts, UPCItemDB, and openFDA with 1.5s timeout
    const results = await Promise.all([
      fetchOFF(barcode),
      fetchUPC(barcode),
      fetchFDA(barcode),
    ]);

    // Find the best match (favor openFDA if medicine, else OFF or UPC)
    const bestMatch = results.find((r) => r !== null && r.name);

    if (bestMatch) {
      // Save rich raw details in database (third-party URL first)
      const saved = await this.prisma.catalogueProduct.create({
        data: {
          barcode,
          name: bestMatch.name,
          brand: bestMatch.brand,
          imageUrl: bestMatch.imageUrl,
          category: bestMatch.category,
        },
      });

      // 🔄 Fire-and-forget: migrate image to our Cloudinary in background
      if (bestMatch.imageUrl && !isCloudinaryUrl(bestMatch.imageUrl)) {
        setImmediate(() => reuploadToCloudinary(this.prisma, barcode, bestMatch.imageUrl!));
      }

      // Return immediately (don't wait for Cloudinary)
      return {
        ...saved,
        category: normalizeCategory(bestMatch.category),
      };
    }

    return null;
  }

  @Get('search')
  async search(@Query('q') query: string) {
    if (!query || query.length < 2) return [];
    const products = await this.prisma.catalogueProduct.findMany({
      where: { name: { contains: query, mode: 'insensitive' } },
      select: { barcode: true, name: true, brand: true, imageUrl: true, category: true },
      take: 10,
    });
    
    return products.map(p => ({
      ...p,
      category: normalizeCategory(p.category)
    }));
  }

  @UseGuards(AuthGuard)
  @Post('contribute')
  async contribute(
    @Body() data: { barcode: string; name: string; brand?: string; imageUrl?: string; category?: string },
    @Request() req: any,
  ) {
    if (!data.barcode || data.barcode.length < 8 || data.barcode.length > 20) {
      throw new BadRequestException('Invalid barcode format');
    }
    if (!data.name || data.name.trim().length < 2) {
      throw new BadRequestException('Product name is required');
    }

    const userId = req.user.sub;
    const existing = await this.prisma.catalogueProduct.findUnique({ where: { barcode: data.barcode } });

    // Never let a contribution clobber existing good data — only fill in
    // fields that are currently missing. Protects the shared catalogue from
    // a buggy or bad-faith authenticated client overwriting correct entries.
    let saved;
    if (existing) {
      saved = await this.prisma.catalogueProduct.update({
        where: { barcode: data.barcode },
        data: {
          brand: existing.brand ?? data.brand,
          imageUrl: existing.imageUrl ?? data.imageUrl,
          category: existing.category ?? data.category,
          lastEditedBy: userId,
          lastEditedAt: new Date(),
        },
      });
    } else {
      saved = await this.prisma.catalogueProduct.create({
        data: {
          barcode: data.barcode,
          name: data.name,
          brand: data.brand ?? null,
          imageUrl: data.imageUrl ?? null,
          category: data.category ?? null,
          contributedBy: userId,
          lastEditedBy: userId,
          lastEditedAt: new Date(),
        },
      });
    }

    // If contributed imageUrl is a third-party URL, migrate it in background
    if (saved.imageUrl && !isCloudinaryUrl(saved.imageUrl)) {
      setImmediate(() => reuploadToCloudinary(this.prisma, data.barcode, saved.imageUrl!));
    }

    return {
      ...saved,
      category: normalizeCategory(saved.category),
    };
  }
}
