/**
 * Alias legibles de los tipos generados desde el OpenAPI de la api (make gen-api).
 * No se escriben tipos de la API a mano: si cambia un esquema, se regenera schema.d.ts.
 */
import type { components } from './schema';

type Schemas = components['schemas'];

export type Continent = Schemas['Continent'];
export type Visibility = Schemas['Visibility'];
export type VisitType = Schemas['VisitType'];
export type LonLat = Schemas['LonLat'];

export type Country = Schemas['CountryOut'];
export type Subdivision = Schemas['SubdivisionOut'];

export type Progress = Schemas['ProgressOut'];
export type UserMap = Schemas['MapOut'];
export type CountryStatus = Schemas['CountryStatus'];
export type PlaceStatus = CountryStatus['status'];
export type CityStatus = Schemas['CityStatus'];
export type MonumentStamp = Schemas['MonumentStamp'];
export type CountrySummary = Schemas['CountrySummaryOut'];
export type CountryTrip = Schemas['CountryTrip'];

export type Trip = Schemas['TripOut'];
export type TripDetail = Schemas['TripDetailOut'];
export type Stop = Schemas['StopOut'];

export type City = Schemas['CityOut'];

export type UploadedPhoto = Schemas['UploadedPhoto'];
export type PhotoUpload = Schemas['PhotoUploadOut'];
export type UploadError = Schemas['UploadError'];

export type PlaceIn = Schemas['PlaceIn'];
export type MemoryIn = Schemas['MemoryIn'];
export type MemoryCreated = Schemas['MemoryCreatedOut'];
export type LitPlaces = Schemas['LitPlaces'];
export type SuggestIn = Schemas['SuggestIn'];
export type MemorySuggestion = Schemas['MemorySuggestion'];
export type SuggestedPlace = Schemas['SuggestedPlace'];
export type SuggestedTrip = Schemas['SuggestedTrip'];
export type SuggestedMonument = Schemas['SuggestedMonument'];
