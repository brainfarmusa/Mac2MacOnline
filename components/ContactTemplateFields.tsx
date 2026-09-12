"use client";

import { formatPhoneNumber, phoneCountries } from "./InternationalPhoneField";

const usStates = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "District of Columbia",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
];
const canadianProvinces = [
  "Alberta",
  "British Columbia",
  "Manitoba",
  "New Brunswick",
  "Newfoundland and Labrador",
  "Northwest Territories",
  "Nova Scotia",
  "Nunavut",
  "Ontario",
  "Prince Edward Island",
  "Quebec",
  "Saskatchewan",
  "Yukon",
];

type Props = {
  phone: string;
  city: string;
  region: string;
  country: string;
  onChange: (
    field: "phone" | "city" | "region" | "country",
    value: string,
  ) => void;
};

export default function ContactTemplateFields({
  phone,
  city,
  region,
  country,
  onChange,
}: Props) {
  const selectedCountry =
    phoneCountries.find((item) => item[2] === country) || phoneCountries[0];
  const regions =
    country === "United States"
      ? usStates
      : country === "Canada"
        ? canadianProvinces
        : [];
  return (
    <>
      <label>
        <span>Phone</span>
        <div className="international-phone">
          <select
            aria-label="Phone country"
            value={selectedCountry[2]}
            onChange={(event) => {
              const nextCountry = event.target.value;
              onChange("country", nextCountry);
              onChange("region", "");
              onChange("phone", formatPhoneNumber(phone, nextCountry));
            }}
          >
            {phoneCountries.map(([code, flag, name, dial]) => (
              <option key={code} value={name}>
                {flag} {name} (+{dial})
              </option>
            ))}
          </select>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={formatPhoneNumber(phone, country)}
            onChange={(event) =>
              onChange("phone", formatPhoneNumber(event.target.value, country))
            }
            placeholder={
              ["US", "CA", "PR", "DO", "JM"].includes(selectedCountry[0])
                ? "(555) 555-5555"
                : "Phone number"
            }
          />
        </div>
      </label>
      <label>
        <span>City</span>
        <input
          autoComplete="address-level2"
          value={city}
          onChange={(event) => onChange("city", event.target.value)}
        />
      </label>
      <label>
        <span>State / region</span>
        {regions.length ? (
          <select
            autoComplete="address-level1"
            value={region}
            onChange={(event) => onChange("region", event.target.value)}
          >
            <option value="">
              Select {country === "Canada" ? "province" : "state"}
            </option>
            {regions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        ) : (
          <input
            autoComplete="address-level1"
            value={region}
            onChange={(event) => onChange("region", event.target.value)}
          />
        )}
      </label>
      <label>
        <span>Country</span>
        <select
          autoComplete="country-name"
          value={country || "United States"}
          onChange={(event) => {
            const nextCountry = event.target.value;
            onChange("country", nextCountry);
            onChange("region", "");
            onChange("phone", formatPhoneNumber(phone, nextCountry));
          }}
        >
          {phoneCountries.map(([code, flag, name]) => (
            <option key={code} value={name}>
              {flag} {name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
