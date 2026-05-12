# Element Tree Contract (ID -> Component Cluster)

Bu sürümde yapı **element ID -> component öbeği** mantığına göre yeniden düzenlendi.

## Pattern

```text
src/...
  component:<name>
    element:<#id>
```

## Özet
- Taranan `src/` dosyası: **37**
- Toplam benzersiz ID: **148**
- Component öbeği, ID öneklerinden türetilir (örn: `#hotelNameText` -> `component:hotel`).

## Src Tree (Component Cluster Bazlı)

### `src/backend/README.md`
- component: `(ID yok)`

### `src/backend/___spi___/ecom-catalog/liteApiCatalog/liteApiCatalog-config.js`
- component: `(ID yok)`

### `src/backend/___spi___/ecom-catalog/liteApiCatalog/liteApiCatalog.js`
- component: `(ID yok)`

### `src/backend/liteApi.web.js`
- component: `(ID yok)`

### `src/backend/liteApiBooking.js`
- component: `(ID yok)`

### `src/backend/liteApiClient.js`
- component: `(ID yok)`

### `src/backend/liteApiHotel.js`
- component: `(ID yok)`

### `src/backend/liteApiSearch.js`
- component: `(ID yok)`

### `src/backend/liteApiTransforms.js`
- component: `(ID yok)`

### `src/backend/permissions.json`
- component: `(ID yok)`

### `src/ops/element-tree-contract.md`
- component: `(ID yok)`

### `src/ops/repo-tree.md`
- component: `(ID yok)`

### `src/pages/Checkout.xeh0y.js`
- component: `checkout`
  - element: `#checkoutBackToHotelButton`
  - element: `#checkoutCheckinDateText`
  - element: `#checkoutCheckoutDateText`
  - element: `#checkoutContentBox`
  - element: `#checkoutContinueToPaymentButton`
  - element: `#checkoutCurrentPriceText`
  - element: `#checkoutDiscountBeforeText`
  - element: `#checkoutErrorBox`
  - element: `#checkoutErrorText`
  - element: `#checkoutGuestEmailInput`
  - element: `#checkoutGuestFirstNameInput`
  - element: `#checkoutGuestFormErrorText`
  - element: `#checkoutGuestLastNameInput`
  - element: `#checkoutGuestPhoneInput`
  - element: `#checkoutGuestsSummaryText`
  - element: `#checkoutHotelAddressText`
  - element: `#checkoutHotelNameText`
  - element: `#checkoutLoadingBox`
  - element: `#checkoutPaymentLiteapiCustomElement`
  - element: `#checkoutPaymentLoadingText`
  - element: `#checkoutPaymentSectionBox`
  - element: `#checkoutPrebookStatusText`
  - element: `#checkoutPriceNoteText`
  - element: `#checkoutRefundableTagText`
  - element: `#checkoutRoomImage`
  - element: `#checkoutRoomNameText`
  - element: `#checkoutSandboxCardNoteText`

### `src/pages/Confirmation .umsny.js`
- component: `confirmation`
  - element: `#confirmationBackToCheckoutButton`
  - element: `#confirmationBackToHotelButton`
  - element: `#confirmationBackToHotelButton2`
  - element: `#confirmationBookingIdText`
  - element: `#confirmationBookingStatusText`
  - element: `#confirmationCheckinDateText`
  - element: `#confirmationCheckoutDateText`
  - element: `#confirmationCurrentPriceText`
  - element: `#confirmationDiscountBeforePriceText`
  - element: `#confirmationErrorBox`
  - element: `#confirmationErrorText`
  - element: `#confirmationErrorTitleText`
  - element: `#confirmationGoHomeButton`
  - element: `#confirmationGuestEmailText`
  - element: `#confirmationGuestNameText`
  - element: `#confirmationGuestsSummaryText`
  - element: `#confirmationHotelAddressText`
  - element: `#confirmationHotelConfirmationCodeText`
  - element: `#confirmationHotelNameText`
  - element: `#confirmationLoadingBox`
  - element: `#confirmationLoadingText`
  - element: `#confirmationLoadingTitleText`
  - element: `#confirmationPoliciesBodyText`
  - element: `#confirmationPoliciesBox`
  - element: `#confirmationPoliciesTitleText`
  - element: `#confirmationPriceNoteText`
  - element: `#confirmationRefundableTagText`
  - element: `#confirmationRoomImage`
  - element: `#confirmationRoomNameText`
  - element: `#confirmationSuccessBox`
  - element: `#confirmationSuccessSubtitleText`
  - element: `#confirmationSuccessTitleText`

### `src/pages/Fullscreen Page.qmvsb.js`
- component: `element`
  - element: `#elementID`

### `src/pages/Home.c1dmp.js`
- component: `(ID yok)`

### `src/pages/Hotel.ggh2z.js`
- component: `hotel`
  - element: `#HotelFacilitiesPopupButton`
  - element: `#HotelPoliciesPopupButton`
  - element: `#hotelAddressText`
  - element: `#hotelCurrentPriceText`
  - element: `#hotelDescriptionBodyText`
  - element: `#hotelGuestRatingText`
  - element: `#hotelHeroGallery`
  - element: `#hotelImportantInformationBodyText`
  - element: `#hotelMapIconLinkText`
  - element: `#hotelMapLinkButton`
  - element: `#hotelNameText`
  - element: `#hotelPerNightText`
  - element: `#hotelPricePrefixText`
  - element: `#hotelReviewCountText`
  - element: `#hotelRoomDetailsButton`
  - element: `#hotelStarsRatingDisplay`
- component: `room`
  - element: `#roomBedTypesText`
  - element: `#roomDescriptionText`
  - element: `#roomDetailsTitleText`
  - element: `#roomGroupsRepeater`
  - element: `#roomMainImage`
  - element: `#roomOfferBoardNameText{N}`
  - element: `#roomOfferColumnFlex{N}`
  - element: `#roomOfferCurrentPriceText{N}`
  - element: `#roomOfferDiscountBeforePriceText{N}`
  - element: `#roomOfferNameText{N}`
  - element: `#roomOfferPerNightText{N}`
  - element: `#roomOfferPriceNoteText{N}`
  - element: `#roomOfferRefundableTagText{N}`
  - element: `#roomOfferRowSlot{N}`
  - element: `#roomOfferSelectionButton{N}`
  - element: `#roomSizeText`
  - element: `#roomSleepsText`

### `src/pages/Hotels.hgv2k.js`
- component: `hotel`
  - element: `#hotelAddressText`
  - element: `#hotelAvailabilityButton`
  - element: `#hotelCardMainImage`
  - element: `#hotelCurrentPriceText`
  - element: `#hotelDiscountBeforePriceText`
  - element: `#hotelGuestRatingText`
  - element: `#hotelNameText`
  - element: `#hotelPriceNoteText`
  - element: `#hotelResulCard`
  - element: `#hotelResultsRepeater`
  - element: `#hotelReviewCountText`
  - element: `#hotelStarsRatingDisplay`
- component: `load`
  - element: `#loadMoreHotelsButton`
- component: `results`
  - element: `#resultsEmptyStateText`

### `src/pages/Kategori Sayfası.bxkde.js`
- component: `element`
  - element: `#elementID`

### `src/pages/README.md`
- component: `(ID yok)`

### `src/pages/Sepet Sayfası.a3rb7.js`
- component: `(ID yok)`

### `src/pages/Teşekkür Sayfası.xoyvv.js`
- component: `element`
  - element: `#elementID`

### `src/pages/Yan Sepet.ywu5j.js`
- component: `element`
  - element: `#elementID`

### `src/pages/guestsSelectionPopUp.d0dgy.js`
- component: `adults`
  - element: `#adultsCountValueText`
  - element: `#adultsCounterDecreaseButton`
  - element: `#adultsCounterIncreaseButton`
- component: `children`
  - element: `#childrenAgeSectionDescriptionText`
  - element: `#childrenAgeSectionTitleText`
  - element: `#childrenAgeSelectionDropdown`
  - element: `#childrenAgeSelectionRepeater`
  - element: `#childrenCountValueText`
  - element: `#childrenCounterDecreaseButton`
  - element: `#childrenCounterIncreaseButton`
- component: `guests`
  - element: `#guestsSelectionCloseButton`

### `src/pages/hotelFacilitiesPopup.e2zn6.js`
- component: `hotel`
  - element: `#hotelFacilitiesRepeater`
  - element: `#hotelFacilitiesText`

### `src/pages/hotelPoliciesPopup.jfte5.js`
- component: `hotel`
  - element: `#hotelPoliciesDescriptionText`
  - element: `#hotelPoliciesNameText`
  - element: `#hotelPoliciesRepeater`

### `src/pages/hotelRoomDetailsPopup.mktuf.js`
- component: `room`
  - element: `#roomAmenitiesRepeater`
  - element: `#roomAmenitiesText`
  - element: `#roomAmenitiesTitleText`
  - element: `#roomBedTypesText`
  - element: `#roomDescriptionText`
  - element: `#roomDetailsGallery`
  - element: `#roomNameText`
  - element: `#roomSizeText`
  - element: `#roomSleepsText`

### `src/pages/masterPage.js`
- component: `element`
  - element: `#elementID`

### `src/pages/Ödeme Adımı.snttm.js`
- component: `element`
  - element: `#elementID`

### `src/pages/Ürün Sayfası.ehby7.js`
- component: `element`
  - element: `#elementID`

### `src/pages/Üye Sayfası.h1csf.js`
- component: `element`
  - element: `#elementID`

### `src/public/README.md`
- component: `(ID yok)`

### `src/public/custom-elements/liteapi-payment-element.js`
- component: `(ID yok)`
- component: `custom-element`
  - element: `liteapi-payment-element`

### `src/public/liteApiDebug.js`
- component: `(ID yok)`

### `src/public/liteApiFlow.js`
- component: `(ID yok)`

### `src/public/liteApiHelpers.js`
- component: `(ID yok)`

### `src/public/searchForm.js`
- component: `adults`
  - element: `#adultsCountValueText`
  - element: `#adultsCounterDecreaseButton`
  - element: `#adultsCounterIncreaseButton`
  - element: `#adultsCounterTitleText`
- component: `check`
  - element: `#checkInDatePickerInput`
  - element: `#checkOutDatePickerInput`
- component: `children`
  - element: `#childrenAgeSelectionDropdown{N}`
  - element: `#childrenCountValueText`
  - element: `#childrenCounterDecreaseButton`
  - element: `#childrenCounterIncreaseButton`
  - element: `#childrenCounterSubtitleText`
  - element: `#childrenCounterTitleText`
- component: `destination`
  - element: `#destinationSearchModeButton`
- component: `guests`
  - element: `#guestsOccupancySelectionInput`
- component: `occupancy`
  - element: `#occupancyChildrenAgeSelectionBox`
  - element: `#occupancySelectionAdultsCounterBox`
  - element: `#occupancySelectionApplyButton`
  - element: `#occupancySelectionBox`
  - element: `#occupancySelectionChildrenCounterBox`
  - element: `#occupancySelectionColumnFlex`
  - element: `#occupancySelectionCounterRowFlex`
- component: `search`
  - element: `#searchFormButton`
  - element: `#searchModeSwitch`
  - element: `#searchQueryInput`
  - element: `#searchQueryInputFieldBox`
  - element: `#searchSuggestionItem`
  - element: `#searchSuggestionSubtitleText`
  - element: `#searchSuggestionTitleText`
  - element: `#searchSuggestionsBox`
  - element: `#searchSuggestionsRepeater`
  - element: `#searchSuggestionsScrollBox`
- component: `vibe`
  - element: `#vibeSearchModeButton`

