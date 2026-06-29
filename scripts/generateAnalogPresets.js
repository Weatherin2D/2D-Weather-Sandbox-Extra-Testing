/**
 * Generates soundingAnalogPresets.js — run: node scripts/generateAnalogPresets.js
 */
const fs = require('fs');
const path = require('path');

// name|location|date|archetype|muCape|stp|srh3|shear6|dcape|pwat|hailIn|risk
const EVENT_LINES = `
Joplin EF5 Tornado|Joplin MO|2011-05-22|pds_tornado|4500|8.4|420|38|720|38|2.5|High
Moore EF5 Tornado|Moore OK|2013-05-20|pds_tornado|4800|9.1|450|44|680|36|2.75|High
El Reno EF3 Tornado|El Reno OK|2013-05-31|classic_tornado|5200|6.2|380|52|900|42|3.0|High
Bridge Creek EF5 Tornado|Bridge Creek OK|1999-05-03|pds_tornado|5500|10.2|480|46|650|35|3.5|High
Greensburg EF5 Tornado|Greensburg KS|2007-05-04|pds_tornado|4200|7.6|400|40|700|40|2.25|High
Parkersburg EF5 Tornado|Parkersburg IA|2008-05-25|pds_tornado|3800|6.8|360|36|620|44|2.0|High
Smithville EF5 Tornado|Smithville MS|2011-04-27|pds_tornado|4100|8.0|390|42|710|41|2.5|High
Hackleburg EF5 Tornado|Hackleburg AL|2011-04-27|pds_tornado|3900|7.5|370|40|690|43|2.25|High
Phil Campbell EF5 Tornado|Phil Campbell AL|2011-04-27|pds_tornado|4000|7.8|385|41|700|42|2.5|High
Tuscaloosa EF4 Tornado|Tuscaloosa AL|2011-04-27|classic_tornado|3600|6.5|340|38|680|45|2.0|High
Birmingham EF4 Tornado|Birmingham AL|2011-04-27|classic_tornado|3500|6.2|330|36|660|46|1.75|High
Super Outbreak Day 1|AL/MS/TN|1974-04-03|pds_tornado|3200|5.8|300|34|580|48|1.5|High
Super Outbreak Day 2|KY/OH|1974-04-04|classic_tornado|2800|4.9|280|32|540|50|1.25|Moderate
Palm Sunday Outbreak|OH/IN/MI|1965-04-11|classic_tornado|2600|4.5|260|30|500|46|1.0|Moderate
Xenia EF5 Tornado|Xenia OH|1974-04-03|pds_tornado|3400|6.0|310|35|590|47|1.75|High
Andover EF5 Tornado|Andover KS|1991-04-26|pds_tornado|3600|6.4|350|37|610|39|2.0|High
Jarrell EF5 Tornado|Jarrell TX|1997-05-27|classic_tornado|3200|5.2|290|28|480|32|1.5|Enhanced
May 3 1999 Outbreak|OKC Metro|1999-05-03|pds_tornado|5400|9.8|470|45|640|34|3.25|High
May 20 2013 Moore|Moore OK|2013-05-20|pds_tornado|4900|9.0|445|43|670|35|2.75|High
May 31 2013 El Reno|El Reno OK|2013-05-31|high_shear_tornado|5100|5.8|400|55|920|40|2.5|High
Dixie Alley Outbreak|MS/AL|2008-02-05|cold_season|2200|3.8|240|32|520|48|0.75|Enhanced
Super Tuesday Outbreak|TN/AR/KY|2008-02-05|cold_season|2400|4.2|255|34|540|47|1.0|Enhanced
Vilonia EF4 Tornado|Vilonia AR|2014-04-27|classic_tornado|3300|5.9|320|36|640|44|1.75|High
Mayflower EF4 Tornado|Mayflower AR|2014-04-27|classic_tornado|3250|5.7|315|35|630|45|1.5|High
Rochelle EF4 Tornado|Rochelle IL|2015-04-09|classic_tornado|2800|4.8|270|30|500|42|1.25|Enhanced
Dallas EF4 Tornado|Garland TX|2015-12-26|cold_season|2100|3.5|220|28|480|40|0.75|Enhanced
Garland EF4 Tornado|Rowlett TX|2015-12-26|cold_season|2050|3.4|215|27|470|41|0.75|Enhanced
Nashville EF3 Tornado|Nashville TN|2020-03-03|classic_tornado|2400|4.0|250|26|450|50|1.0|Enhanced
Murfreesboro EF4 Tornado|Murfreesboro TN|2009-04-10|classic_tornado|2900|4.6|275|31|520|46|1.25|Enhanced
Cordell OK Tornado Family|Cordell OK|1981-05-10|classic_tornado|3500|5.5|300|33|560|36|1.5|Enhanced
Red River Tornado Outbreak|TX/OK|1979-04-10|classic_tornado|3800|6.1|320|35|580|38|2.0|High
Terrible Tuesday Outbreak|TX/OK|1979-04-10|pds_tornado|4000|6.8|340|37|600|37|2.25|High
Wichita Falls EF4 Tornado|Wichita Falls TX|1979-04-10|classic_tornado|3700|5.9|310|34|570|39|1.75|Enhanced
Lubbock EF4 Tornado|Lubbock TX|1970-05-11|classic_tornado|3400|5.2|285|30|520|30|1.5|Enhanced
Plainview TX Supercell|Plainview TX|2015-05-07|hail_monster|4800|4.2|200|38|620|28|4.0|Moderate
Vivian SD Giant Hail|Vivian SD|2010-07-23|hail_monster|5200|2.8|150|32|580|25|8.0|Marginal
Aurora NE Giant Hail|Aurora NE|2003-06-22|hail_monster|4600|3.0|160|34|600|28|7.0|Marginal
Belleville KS Hailstorm|Belleville KS|2016-05-25|hail_monster|4400|3.5|175|36|640|30|3.5|Enhanced
Waurika OK Hailstorm|Waurika OK|2017-05-18|hail_monster|4200|3.2|165|35|610|29|3.0|Enhanced
Geary OK Hailstorm|Geary OK|2012-04-14|hail_monster|4000|4.0|190|33|590|32|2.75|Enhanced
Dodge City KS Hail|Dodge City KS|2016-05-24|hail_monster|4300|3.8|180|37|630|27|3.25|Enhanced
North Texas Hail Outbreak|DFW TX|1995-05-05|hail_monster|3800|3.5|170|32|560|35|2.5|Enhanced
Fort Worth Hailstorm|Fort Worth TX|1995-05-05|hail_monster|3600|3.2|160|30|540|36|2.25|Enhanced
San Antonio Hail|San Antonio TX|2016-04-12|hail_monster|3500|2.8|140|28|500|38|2.0|Slight
Oklahoma City Hail|OKC OK|2010-05-10|hail_monster|4100|3.6|185|34|600|31|3.0|Enhanced
Denver Metro Hail|Denver CO|1990-07-11|hail_monster|3200|2.0|120|26|480|22|2.5|Marginal
Cheyenne WY Hail|Cheyenne WY|1979-07-16|hail_monster|2800|1.8|100|24|450|20|2.0|Marginal
June 29 2012 Derecho|Mid-Atlantic US|2012-06-29|derecho|2800|1.5|80|48|2200|35|0.5|Slight
August 2020 Iowa Derecho|Iowa/IL|2020-08-10|derecho|3200|2.0|100|52|2400|40|0.75|Slight
May 1998 Derecho|MN/WI|1998-05-31|derecho|2600|1.8|90|46|2100|38|0.5|Slight
July 2003 Kansas Derecho|KS/MO|2003-07-04|derecho|3000|2.2|110|50|2300|42|0.75|Slight
June 2017 Northern Plains Derecho|ND/MN|2017-06-09|derecho|2900|1.9|95|49|2250|36|0.5|Slight
Serial Derecho Ohio|Ohio Valley|2012-06-29|derecho|2700|1.6|85|47|2150|44|0.5|Slight
Bow Echo Kansas|Central KS|2005-06-07|derecho|2500|1.4|75|44|2000|32|0.5|Marginal
Squall Line Oklahoma|Central OK|2011-05-24|squall_line|3000|2.5|120|42|1800|45|1.0|Enhanced
QLCS Tornado Outbreak|OH/PA|2011-05-25|squall_line|2400|3.0|150|38|1600|48|0.75|Enhanced
Hurricane Ivan Tornadoes|VA/MD/PA|2004-09-17|tropical|2200|2.8|180|22|800|55|0.5|Enhanced
Hurricane Frances Tornadoes|FL/GA|2004-09-05|tropical|2000|2.5|160|20|700|58|0.5|Slight
Hurricane Rita Outer Bands|LA/TX|2005-09-24|tropical|2100|2.6|170|21|750|52|0.5|Slight
Hurricane Katrina Bands|MS/AL|2005-08-29|tropical|2300|2.9|175|23|820|54|0.5|Enhanced
Hurricane Harvey Training|Houston TX|2017-08-26|flood|1800|1.2|60|12|400|72|0.25|Marginal
Louisiana Flood Event|Baton Rouge LA|2016-08-12|flood|1600|1.0|50|10|350|68|0.25|Marginal
Nashville Flood|Nashville TN|2010-05-01|flood|2000|1.8|90|14|500|62|0.5|Slight
Texas Hill Country Flood|Central TX|2015-05-23|flood|2200|2.0|100|16|550|65|0.5|Slight
Kansas City Flash Flood|Kansas City MO|1977-09-12|flood|2400|2.2|110|18|600|58|0.75|Slight
Big Thompson Flood|CO Front Range|1976-07-31|flood|1500|0.8|40|8|300|55|0.25|Marginal
Rapid City Flood|Rapid City SD|1972-06-09|flood|1400|0.7|35|7|280|50|0.25|Marginal
St Louis Flash Flood|St Louis MO|1982-08-01|flood|2100|1.9|95|15|520|60|0.5|Slight
Houston Memorial Day Flood|Houston TX|2015-05-25|flood|1900|1.5|70|13|420|64|0.25|Marginal
Central US Supercell Day|KS/NE|2007-05-05|classic_tornado|3600|5.8|310|36|650|38|2.0|High
Chapman KS EF4|Chapman KS|2016-05-25|classic_tornado|3400|5.5|295|34|620|36|1.75|Enhanced
Salina KS Supercell|Salina KS|2016-05-25|hail_monster|3800|4.5|220|35|640|30|3.5|Enhanced
Wakefield NE Tornado|Wakefield NE|2014-06-16|classic_tornado|3000|4.8|280|32|580|40|1.5|Enhanced
Pilger NE Twin Tornadoes|Pilger NE|2014-06-16|classic_tornado|3100|5.0|285|33|590|39|1.5|Enhanced
Rozel KS EF4|Rozel KS|2013-05-18|classic_tornado|3500|5.6|300|35|610|34|2.0|Enhanced
Bennington KS EF3|Bennington KS|2013-05-28|classic_tornado|3200|5.2|290|33|600|35|1.75|Enhanced
Hallam NE Tornado|Hallam NE|2004-05-22|classic_tornado|3300|5.4|295|34|605|37|1.75|Enhanced
Manchester SD Tornado|Manchester SD|2003-06-24|classic_tornado|2900|4.6|270|30|550|38|1.25|Enhanced
Northwood ND Tornado|Northwood ND|2007-08-26|cold_season|1800|2.8|200|26|420|42|0.75|Slight
La Plata MD Tornado|La Plata MD|2002-04-28|classic_tornado|2600|4.2|260|28|480|50|1.0|Enhanced
College Park MD Tornado|College Park MD|2001-09-24|tropical|1900|2.4|170|18|600|52|0.5|Slight
Pampa TX Tornado|Pampa TX|1995-06-08|classic_tornado|3400|5.0|285|32|570|30|1.75|Enhanced
Dimmit TX Tornado|Dimmit TX|1995-06-08|classic_tornado|3350|4.9|280|31|565|31|1.5|Enhanced
Amarillo TX Supercell|Amarillo TX|2013-05-28|hail_monster|4000|3.8|190|34|620|26|3.0|Enhanced
Childress TX Supercell|Childress TX|2012-04-13|hail_monster|3800|3.5|175|33|600|28|2.75|Enhanced
Canadian TX Supercell|Canadian TX|2001-05-10|classic_tornado|3600|5.3|295|33|580|29|2.0|Enhanced
Pampa TX Hailstorm|Pampa TX|1993-08-15|hail_monster|3500|2.5|140|30|520|24|2.5|Marginal
Spearman TX Hail|Spearman TX|2017-05-16|hail_monster|3900|3.3|170|34|610|27|3.0|Enhanced
Woodward OK Tornado|Woodward OK|1947-04-09|classic_tornado|3000|4.0|250|28|500|32|1.25|Enhanced
Snyder OK Tornado|Snyder OK|1905-05-10|classic_tornado|2800|3.8|240|26|480|30|1.0|Enhanced
Piedmont OK Tornado|Piedmont OK|2011-05-24|classic_tornado|3700|5.7|305|36|630|35|2.0|Enhanced
Chickasha OK Tornado|Chickasha OK|2011-05-24|classic_tornado|3650|5.6|300|35|625|36|1.75|Enhanced
Washington OK Tornado|Washington OK|2011-05-24|classic_tornado|3600|5.5|298|35|620|36|1.75|Enhanced
Hinton OK Tornado|Hinton OK|2011-05-24|classic_tornado|3550|5.4|295|34|615|37|1.5|Enhanced
Calumet OK Tornado|Calumet OK|2011-05-24|classic_tornado|3500|5.3|292|34|610|37|1.5|Enhanced
Elk City OK Tornado|Elk City OK|2017-05-16|classic_tornado|3200|5.0|285|33|600|32|1.5|Enhanced
Cheyenne OK Supercell|Cheyenne OK|2017-05-16|hail_monster|3400|3.6|180|34|610|30|2.75|Enhanced
Leedey OK Tornado|Leedey OK|2022-05-04|classic_tornado|3100|4.8|275|32|590|33|1.5|Enhanced
Lockett TX Tornado|Lockett TX|1979-04-10|classic_tornado|3700|5.8|305|34|575|36|2.0|Enhanced
Seymour TX Tornado|Seymour TX|1979-04-10|classic_tornado|3650|5.7|300|34|570|37|1.75|Enhanced
Wichita Falls 1979|Wichita Falls TX|1979-04-10|classic_tornado|3750|5.9|310|35|580|38|1.75|Enhanced
Grand Island NE Tornadoes|Grand Island NE|1980-06-03|classic_tornado|3000|4.5|270|30|540|40|1.25|Enhanced
Barneveld WI Tornado|Barneveld WI|1984-06-08|classic_tornado|2800|4.0|255|28|500|44|1.0|Enhanced
Marshfield WI Tornado|Marshfield WI|2011-06-07|cold_season|2200|3.6|230|26|460|46|0.75|Slight
La Crosse WI Tornado|La Crosse WI|1989-06-07|classic_tornado|2600|3.8|245|27|490|45|1.0|Slight
Menomonie WI Tornado|Menomonie WI|1958-06-04|classic_tornado|2400|3.5|235|26|470|44|0.75|Slight
Oakfield WI Hail|Oakfield WI|1996-07-18|hail_monster|3200|2.5|150|28|520|42|5.0|Marginal
Austin MN Tornado|Austin MN|2009-06-17|classic_tornado|2700|4.1|260|28|510|43|1.0|Enhanced
Wadena MN Tornado|Wadena MN|2010-06-17|classic_tornado|2900|4.4|268|29|530|42|1.25|Enhanced
Albert Lea MN Tornado|Albert Lea MN|2010-06-17|classic_tornado|2850|4.3|265|29|525|42|1.25|Enhanced
Comfrey MN Tornado|Comfrey MN|1998-03-29|cold_season|2000|3.2|210|24|440|40|0.75|Slight
St Peter MN Tornado|St Peter MN|1998-03-29|cold_season|2050|3.3|215|25|445|41|0.75|Slight
Southern MN Outbreak|MN/IA|1998-03-29|cold_season|2100|3.4|220|25|450|41|0.75|Slight
Chanhassen MN Tornado|Chanhassen MN|2006-07-21|classic_tornado|2500|3.7|240|26|480|44|1.0|Slight
Rogers MN Tornado|Rogers MN|2006-07-21|classic_tornado|2480|3.6|238|26|478|44|1.0|Slight
North Branch MN Tornado|North Branch MN|2008-06-01|classic_tornado|2600|3.9|248|27|490|43|1.0|Slight
Benson WI Tornado|Benson WI|2011-05-22|classic_tornado|2700|4.0|252|28|495|44|1.0|Enhanced
Minneapolis Tornado|Minneapolis MN|2011-05-22|classic_tornado|2650|3.9|250|27|492|44|1.0|Enhanced
North Mpls Tornado|North Minneapolis|2011-05-22|classic_tornado|2620|3.8|248|27|490|44|1.0|Enhanced
Kasota MN Supercell|Kasota MN|2010-06-17|classic_tornado|2880|4.3|266|29|528|42|1.25|Enhanced
St Louis EF4 Tornado|St Louis MO|2011-04-22|classic_tornado|3000|4.7|275|30|520|47|1.25|Enhanced
Good Friday Tornado|St Louis MO|1957-05-20|classic_tornado|2800|4.2|260|28|500|46|1.0|Enhanced
Ruskin Heights EF5|Kansas City MO|1957-05-20|pds_tornado|3200|5.5|300|32|560|45|1.75|High
Stockton MO Tornado|Stockton MO|2003-05-04|classic_tornado|2900|4.5|270|29|530|42|1.25|Enhanced
Pierce City MO Tornado|Pierce City MO|2003-05-04|classic_tornado|2850|4.4|268|29|525|42|1.25|Enhanced
Madison WI Tornado|Madison WI|2014-06-16|classic_tornado|2400|3.5|230|25|460|45|0.75|Slight
Verona WI Tornado|Verona WI|2014-06-16|classic_tornado|2380|3.4|228|25|458|45|0.75|Slight
Monroe WI Tornado|Monroe WI|2005-11-12|cold_season|1900|3.0|200|24|420|43|0.5|Slight
Evansville IN Tornado|Evansville IN|2005-11-06|cold_season|2000|3.2|210|25|430|44|0.75|Slight
Vansant VA Tornado|Vansant VA|2011-04-28|classic_tornado|2800|4.3|265|29|510|48|1.0|Enhanced
Glade Spring VA Tornado|Glade Spring VA|2011-04-28|classic_tornado|2750|4.2|262|28|505|48|1.0|Enhanced
Raleigh NC Tornado|Raleigh NC|1988-11-28|cold_season|2100|3.3|215|24|440|46|0.75|Slight
Sanford NC Tornado|Sanford NC|2011-04-16|classic_tornado|2600|4.0|250|27|490|47|1.0|Enhanced
Fayetteville NC Tornado|Fayetteville NC|2011-04-16|classic_tornado|2550|3.9|248|27|485|47|1.0|Enhanced
Roanoke Rapids NC Tornado|Roanoke Rapids NC|1984-11-23|cold_season|1950|3.1|205|23|415|45|0.5|Slight
Anderson SC Tornado|Anderson SC|1984-03-28|classic_tornado|2400|3.7|240|26|470|48|0.75|Slight
Seneca SC Tornado|Seneca SC|2020-04-13|classic_tornado|2700|4.1|258|28|500|47|1.0|Enhanced
Oconee SC Tornado|Oconee SC|2020-04-13|classic_tornado|2680|4.0|256|28|498|47|1.0|Enhanced
New Orleans Tornado|New Orleans LA|2022-03-22|classic_tornado|2200|3.6|230|24|450|52|0.75|Slight
Arabia Mountain GA Tornado|Atlanta GA|2008-03-14|classic_tornado|2300|3.7|235|25|460|48|0.75|Slight
Atlanta Tornado|Atlanta GA|2008-03-14|classic_tornado|2350|3.8|238|25|465|48|0.75|Slight
Gainesville GA Tornado|Gainesville GA|1936-04-06|classic_tornado|2600|4.0|250|27|490|46|1.0|Enhanced
Tupelo MS Tornado|Tupelo MS|1936-04-05|pds_tornado|3000|5.0|280|30|540|44|1.5|High
Natchez MS Tornado|Natchez MS|1840-05-07|classic_tornado|2800|4.2|260|28|500|50|1.0|Enhanced
Starkville MS Tornado|Starkville MS|2002-11-10|cold_season|2100|3.4|218|25|435|46|0.75|Slight
Columbus MS Tornado|Columbus MS|2002-11-10|cold_season|2080|3.3|216|25|432|46|0.75|Slight
Yazoo City MS Tornado|Yazoo City MS|2010-04-24|classic_tornado|2900|4.5|272|29|530|45|1.25|Enhanced
Louisville MS Tornado|Louisville MS|2014-04-28|classic_tornado|2800|4.3|265|28|515|45|1.0|Enhanced
Columbus MS EF3|Columbus MS|2019-04-13|classic_tornado|2700|4.2|260|28|510|46|1.0|Enhanced
Pine Belt MS Tornado|Hattiesburg MS|2013-02-10|cold_season|2000|3.5|220|26|440|50|0.75|Slight
Hattiesburg EF4 Tornado|Hattiesburg MS|2017-01-21|cold_season|2200|3.8|235|27|460|49|1.0|Enhanced
Adairsville GA Tornado|Adairsville GA|2013-01-30|cold_season|2100|3.6|225|26|450|47|0.75|Slight
Gordon County GA Tornado|Gordon County GA|2011-04-27|classic_tornado|2900|4.5|272|29|530|46|1.25|Enhanced
Ringgold GA EF4 Tornado|Ringgold GA|2011-04-27|classic_tornado|3000|4.7|278|30|540|45|1.5|Enhanced
Cleveland TN Tornado|Cleveland TN|2011-04-27|classic_tornado|2850|4.4|268|29|520|46|1.25|Enhanced
Apison TN Tornado|Apison TN|2011-04-27|classic_tornado|2820|4.3|266|29|518|46|1.25|Enhanced
Chattanooga TN Tornado|Chattanooga TN|2011-04-27|classic_tornado|2800|4.2|264|28|515|46|1.25|Enhanced
Windsor CO Tornado|Windsor CO|2008-05-22|classic_tornado|2400|3.5|230|26|480|28|1.0|Slight
Limon CO Tornado|Limon CO|1990-06-06|classic_tornado|2600|3.8|245|27|500|25|1.25|Slight
Holyoke CO Tornado|Holyoke CO|2010-06-20|classic_tornado|2500|3.6|238|26|490|26|1.0|Slight
Wray CO Tornado|Wray CO|2016-05-07|classic_tornado|2800|4.0|255|28|520|28|1.25|Enhanced
Simla CO Tornado|Simla CO|2015-06-04|classic_tornado|2700|3.9|250|27|510|27|1.0|Enhanced
Campo CO Tornado|Campo CO|2010-05-31|classic_tornado|2650|3.8|248|27|505|28|1.0|Slight
La Junta CO Supercell|La Junta CO|2001-05-10|hail_monster|3000|2.8|160|28|500|22|2.5|Marginal
Burlington CO Supercell|Burlington CO|2016-05-08|hail_monster|2900|2.6|150|27|480|20|2.25|Marginal
Scott City KS Hail|Scott City KS|2016-05-24|hail_monster|4000|3.5|175|35|620|28|3.0|Enhanced
Leoti KS Supercell|Leoti KS|2016-05-24|hail_monster|3950|3.4|172|34|615|28|2.75|Enhanced
WaKeeney KS Supercell|WaKeeney KS|2016-05-24|hail_monster|3900|3.3|170|34|610|29|2.5|Enhanced
Quinter KS Tornado|Quinter KS|2008-05-23|classic_tornado|3200|5.0|285|33|600|32|1.75|Enhanced
Hill City KS Tornado|Hill City KS|2008-05-23|classic_tornado|3150|4.9|282|33|595|32|1.5|Enhanced
Codell KS Tornado|Codell KS|1916-05-20|classic_tornado|3000|4.5|270|30|550|35|1.25|Enhanced
Udall KS Tornado|Udall KS|1955-05-25|pds_tornado|3400|6.0|310|34|580|38|2.0|High
Greensburg KS EF5|Greensburg KS|2007-05-04|pds_tornado|4200|7.6|400|40|700|40|2.25|High
Hesston KS Tornado|Hesston KS|1991-03-13|cold_season|2500|4.0|255|28|500|40|1.25|Enhanced
McConnell AFB Tornado|Wichita KS|1991-03-13|cold_season|2480|3.9|252|28|498|40|1.25|Enhanced
Andover KS Tornado|Andover KS|1991-04-26|pds_tornado|3600|6.4|350|37|610|39|2.0|High
Wichita KS Tornado|Wichita KS|1999-05-03|classic_tornado|3800|6.2|320|36|580|36|2.0|High
Mulvane KS Tornado|Mulvane KS|1999-05-03|classic_tornado|3750|6.0|315|35|575|37|1.75|High
Haysville KS Tornado|Haysville KS|1999-05-03|classic_tornado|3700|5.9|310|35|570|37|1.75|High
El Dorado KS Supercell|El Dorado KS|2016-05-25|hail_monster|3600|3.8|185|34|600|33|2.75|Enhanced
Argonia KS Supercell|Argonia KS|2016-05-25|hail_monster|3550|3.7|182|33|595|33|2.5|Enhanced
Attica KS Tornado|Attica KS|2004-05-29|classic_tornado|3100|4.8|280|32|580|35|1.5|Enhanced
Harper KS Tornado|Harper KS|2004-05-29|classic_tornado|3050|4.7|278|32|575|35|1.5|Enhanced
Hoisington KS Tornado|Hoisington KS|2001-04-21|classic_tornado|2900|4.5|270|30|550|36|1.25|Enhanced
Great Bend KS Hail|Great Bend KS|2016-05-25|hail_monster|3700|3.6|178|34|605|31|3.0|Enhanced
Medicine Lodge KS Supercell|Medicine Lodge KS|2016-05-25|hail_monster|3650|3.5|175|33|600|32|2.75|Enhanced
Coldwater KS Supercell|Coldwater KS|2016-05-25|hail_monster|3600|3.4|172|33|595|32|2.5|Enhanced
Pratt KS Supercell|Pratt KS|2016-05-25|hail_monster|3580|3.4|170|33|592|32|2.5|Enhanced
Liberal KS Supercell|Liberal KS|2016-05-25|hail_monster|3500|3.2|165|32|585|30|2.25|Enhanced
Guymon OK Supercell|Guymon OK|2016-05-16|hail_monster|3400|3.0|160|32|580|28|2.0|Enhanced
Boise City OK Supercell|Boise City OK|2016-05-16|hail_monster|3350|2.9|158|31|575|28|2.0|Enhanced
Dalhart TX Supercell|Dalhart TX|2016-05-16|hail_monster|3300|2.8|155|31|570|27|1.75|Enhanced
Stratford TX Supercell|Stratford TX|2016-05-16|hail_monster|3280|2.8|152|30|568|27|1.75|Enhanced
Clovis NM Supercell|Clovis NM|2015-05-23|hail_monster|3200|2.6|145|29|550|26|2.0|Marginal
Portales NM Supercell|Portales NM|2015-05-23|hail_monster|3180|2.5|142|29|548|26|1.75|Marginal
Roswell NM Supercell|Roswell NM|2015-05-23|hail_monster|3150|2.5|140|28|545|26|1.75|Marginal
Carlsbad NM Supercell|Carlsbad NM|2014-05-21|hail_monster|3000|2.2|130|27|520|24|1.5|Marginal
Lubbock TX Haboob|Lubbock TX|2011-10-17|haboob|2200|0.8|40|22|1200|18|0.25|Marginal
Phoenix AZ Haboob|Phoenix AZ|2011-07-05|haboob|1800|0.5|30|18|900|12|0.1|Marginal
Tucson AZ Microburst|Tucson AZ|2011-08-08|microburst|2400|0.6|35|20|1500|15|0.25|Marginal
Las Vegas NV Wind|Las Vegas NV|2012-07-06|microburst|2000|0.5|28|16|1300|10|0.1|Marginal
Elevated Supercell NE|North Platte NE|2019-05-17|elevated|2800|3.5|200|32|550|35|1.5|Enhanced
Elevated Hail CO|Denver CO|2018-05-08|elevated|2600|2.8|170|30|520|30|2.0|Slight
High Plains LP Supercell|Limon CO|2014-06-03|high_based|3000|2.5|140|28|480|22|2.0|Marginal
Texas Panhandle LP|Amarillo TX|2013-05-28|high_based|3200|2.8|155|30|500|24|2.25|Marginal
Kansas HP Supercell|Russell KS|2016-05-25|high_based|3400|3.0|165|32|520|26|2.5|Enhanced
Oklahoma HP Outbreak|W OK|2012-04-13|high_based|3600|3.5|180|34|540|28|2.75|Enhanced
Tri-State Tornado Analog|MO/IL/IN|1925-03-18|pds_tornado|3500|7.0|380|38|650|42|2.0|High
Palm Sunday 1965|OH/IN/MI|1965-04-11|classic_tornado|2600|4.5|260|30|500|46|1.0|Moderate
April 2011 Super Outbreak|AL/TN/MS|2011-04-27|pds_tornado|4000|7.5|370|40|700|43|2.25|High
May 2003 Tornado Outbreak|MO/KS/OK|2003-05-04|classic_tornado|3200|5.2|290|33|600|38|1.75|Enhanced
May 2004 Outbreak|NE/IA|2004-05-22|classic_tornado|3000|4.8|280|32|580|40|1.5|Enhanced
May 2008 Outbreak|KS/OK|2008-05-22|classic_tornado|3400|5.5|295|34|610|36|2.0|Enhanced
May 2010 Outbreak|KS/OK|2010-05-10|hail_monster|4000|4.0|200|35|620|32|3.0|Enhanced
May 2016 Outbreak|KS/OK/TX|2016-05-25|hail_monster|4200|4.5|210|36|640|30|3.25|Enhanced
May 2019 Outbreak|KS/OK|2019-05-17|classic_tornado|3500|5.5|295|34|610|34|2.0|Enhanced
European Supercell Italy|Veneto Italy|2012-07-29|classic_tornado|2800|3.5|200|28|480|40|1.5|Slight
European Hail Germany|Bavaria Germany|2013-07-28|hail_monster|3200|2.5|140|26|500|38|3.5|Marginal
Bangladesh Tornado|Manikganj Bangladesh|1989-04-26|pds_tornado|4500|6.5|350|30|600|55|1.5|High
Argentina Hailstorm|Cordoba Argentina|2018-02-08|hail_monster|3800|3.0|160|32|580|35|4.0|Marginal
Australia Supercell|Brisbane QLD|2021-12-16|classic_tornado|3000|3.8|220|28|520|48|1.5|Enhanced
South Africa Supercell|Johannesburg SA|2017-10-02|hail_monster|2800|2.5|150|26|480|42|2.5|Marginal
`.trim().split('\n').filter(Boolean);

const HAZARD_DEFS = [
  ['PDS Tornado', '#FF00FF', (i) => i.stp >= 2.5 && i.srh3km >= 200 && i.muCape >= 2200],
  ['Tornado', '#FF0066', (i) => i.stp >= 0.8 && i.srh3km >= 100],
  ['Supercell', '#FF4400', (i) => i.muCape >= 900 && i.shear6km >= 14],
  ['Giant Hail', '#AA00FF', (i) => i.estHailIn >= 2.0 && i.muCape >= 1800],
  ['Large Hail', '#FF8800', (i) => i.estHailIn >= 1.0],
  ['Hail', '#FFCC00', (i) => i.muCape >= 550],
  ['Destructive Winds', '#FF4400', (i) => i.dcape >= 1100 && i.shear6km >= 20],
  ['Damaging Winds', '#FF8800', (i) => i.dcape >= 650 || i.shear6km >= 16],
  ['Flooding/Heavy Rain', '#0088FF', (i) => i.pwat_mm >= 32],
  ['General Thunderstorm', '#AAAAAA', (i) => i.muCape >= 200],
];

function hf(v, min, moderate, full) {
  if (v < min) return 0;
  if (v >= full) return 1;
  if (v <= moderate) return 0.08 + (v - min) / (moderate - min) * 0.34;
  return 0.42 + (v - moderate) / (full - moderate) * 0.58;
}

function hazardPct(factors, cap) {
  if (factors.some(f => f <= 0)) return 0;
  const gm = Math.pow(factors.reduce((a, b) => a * b, 1), 1 / factors.length);
  return Math.min(cap, Math.round(Math.pow(gm, 1.55) * 100));
}

const ARCH_HAZARD_CTX = {
  pds_tornado: { lapseN: 7.3, mixedPhaseKm: 5.5, moistF: 0.86, drySlot: 0.1,
    boost: {'PDS Tornado': 1.12, 'Tornado': 1.08, 'Supercell': 1.05},
    suppress: {'Destructive Winds': 0.25, 'Giant Hail': 0.55, 'Flooding/Heavy Rain': 0.65} },
  classic_tornado: { lapseN: 7.0, mixedPhaseKm: 4.8, moistF: 0.8, drySlot: 0.15,
    boost: {'Tornado': 1.08, 'Supercell': 1.05, 'PDS Tornado': 0.95},
    suppress: {'Destructive Winds': 0.35, 'Giant Hail': 0.6} },
  high_shear_tornado: { lapseN: 6.8, mixedPhaseKm: 5.2, moistF: 0.78, drySlot: 0.2,
    boost: {'Tornado': 1.1, 'Supercell': 1.08, 'Damaging Winds': 1.05},
    suppress: {'Giant Hail': 0.5} },
  cold_season: { lapseN: 6.2, mixedPhaseKm: 3.5, moistF: 0.72, drySlot: 0.25,
    boost: {'Tornado': 1.05, 'Supercell': 1.02},
    suppress: {'Giant Hail': 0.35, 'PDS Tornado': 0.7} },
  hail_monster: { lapseN: 8.7, mixedPhaseKm: 8.5, moistF: 0.48, drySlot: 0.35,
    boost: {'Giant Hail': 1.2, 'Large Hail': 1.15, 'Hail': 1.1, 'Supercell': 1.03},
    suppress: {'PDS Tornado': 0.2, 'Tornado': 0.3, 'Flooding/Heavy Rain': 0.45} },
  derecho: { lapseN: 6.5, mixedPhaseKm: 2.2, moistF: 0.68, drySlot: 0.72,
    boost: {'Destructive Winds': 1.25, 'Damaging Winds': 1.18},
    suppress: {'PDS Tornado': 0.08, 'Tornado': 0.15, 'Giant Hail': 0.12, 'Supercell': 0.55} },
  flood: { lapseN: 5.4, mixedPhaseKm: 1.2, moistF: 0.94, drySlot: 0.04,
    boost: {'Flooding/Heavy Rain': 1.3, 'General Thunderstorm': 1.05},
    suppress: {'Giant Hail': 0.1, 'PDS Tornado': 0.12, 'Destructive Winds': 0.4} },
  squall_line: { lapseN: 6.4, mixedPhaseKm: 3.0, moistF: 0.76, drySlot: 0.45,
    boost: {'Damaging Winds': 1.12, 'Tornado': 1.05, 'Destructive Winds': 1.08},
    suppress: {'Giant Hail': 0.25, 'PDS Tornado': 0.35} },
  tropical: { lapseN: 5.5, mixedPhaseKm: 2.8, moistF: 0.9, drySlot: 0.08,
    boost: {'Tornado': 1.06, 'Flooding/Heavy Rain': 1.1, 'General Thunderstorm': 1.08},
    suppress: {'Giant Hail': 0.2, 'PDS Tornado': 0.25} },
  elevated: { lapseN: 7.1, mixedPhaseKm: 4.0, moistF: 0.62, drySlot: 0.3,
    boost: {'Hail': 1.08, 'Supercell': 1.05},
    suppress: {'PDS Tornado': 0.4, 'Flooding/Heavy Rain': 0.5} },
  high_based: { lapseN: 8.0, mixedPhaseKm: 6.5, moistF: 0.42, drySlot: 0.5,
    boost: {'Large Hail': 1.1, 'Hail': 1.08, 'Damaging Winds': 1.05},
    suppress: {'PDS Tornado': 0.15, 'Tornado': 0.25, 'Flooding/Heavy Rain': 0.35} },
  haboob: { lapseN: 7.5, mixedPhaseKm: 1.0, moistF: 0.15, drySlot: 0.95,
    boost: {'Damaging Winds': 1.2, 'Destructive Winds': 1.1},
    suppress: {'Tornado': 0.05, 'Hail': 0.08, 'Flooding/Heavy Rain': 0.05} },
  microburst: { lapseN: 7.8, mixedPhaseKm: 1.5, moistF: 0.25, drySlot: 0.88,
    boost: {'Destructive Winds': 1.22, 'Damaging Winds': 1.15},
    suppress: {'Tornado': 0.06, 'PDS Tornado': 0.04, 'Hail': 0.1} },
};

function computeHazards(idx, archetype, seed) {
  const ctx = ARCH_HAZARD_CTX[archetype] || ARCH_HAZARD_CTX.classic_tornado;
  const moistF = ctx.moistF;
  const lapseN = ctx.lapseN;
  const mixedPhaseKm = ctx.mixedPhaseKm;
  const drySlot = ctx.drySlot;
  const shear3 = idx.shear3km || idx.shear6km * 0.55;
  const rows = [
    ['PDS Tornado', '#FF00FF', hazardPct([hf(idx.stp, 2.5, 5, 10), hf(idx.vtp || idx.stp * 0.8, 1.5, 3.5, 7), hf(idx.srh3km, 200, 320, 480), hf(idx.muCape, 2200, 3200, 5000), moistF], 52)],
    ['Tornado', '#FF0066', hazardPct([hf(idx.stp, 0.8, 2, 5), hf(idx.vtp || idx.stp * 0.7, 0.6, 1.8, 4), hf(idx.srh3km, 100, 200, 380), hf(shear3, 10, 16, 26), moistF], 48)],
    ['Supercell', '#FF4400', hazardPct([hf(idx.muCape, 900, 1600, 3200), hf(idx.shear6km, 14, 20, 32), hf(idx.srh3km, 80, 180, 320), moistF], 55)],
    ['Giant Hail', '#AA00FF', hazardPct([hf(idx.muCape, 1800, 2600, 4500), hf(lapseN, 7.8, 8.5, 9.8), hf(idx.shear6km, 18, 24, 36), hf(mixedPhaseKm, 3.5, 5.5, 8), moistF], 50)],
    ['Large Hail', '#FF8800', hazardPct([hf(idx.muCape, 1100, 1800, 3200), hf(lapseN, 7.0, 7.8, 9.0), hf(idx.estHailIn, 0.85, 1.25, 2.2), moistF], 45)],
    ['Hail', '#FFCC00', hazardPct([hf(idx.muCape, 550, 1000, 2200), hf(lapseN, 6.2, 7.0, 8.5), hf(mixedPhaseKm, 1.8, 3.5, 7), moistF], 42)],
    ['Destructive Winds', '#FF4400', hazardPct([hf(idx.dcape, 1100, 1700, 2800), hf(idx.shear6km, 20, 28, 40), hf(drySlot, 0.35, 0.55, 0.85)], 48)],
    ['Damaging Winds', '#FF8800', hazardPct([hf(idx.dcape, 650, 1000, 1800), hf(idx.shear6km, 16, 22, 34), hf(Math.max(idx.dcape / 1200, drySlot), 0.45, 0.7, 1.0)], 40)],
    ['Flooding/Heavy Rain', '#0088FF', hazardPct([hf(idx.pwat_mm, 32, 42, 58), hf(idx.muCape, 350, 800, 1800), hf(1 - shear3 / 30, 0.35, 0.55, 0.85), moistF], 45)],
  ];
  if (idx.muCape >= 200) {
    rows.push(['General Thunderstorm', '#AAAAAA', hazardPct([hf(idx.muCape, 200, 500, 1400), hf(idx.pwat_mm, 12, 22, 40)], 38)]);
  }
  const jitter = 0.94 + (seed % 13) * 0.01;
  return rows.map(([label, color, pct]) => {
    let score = pct;
    if (ctx.boost && ctx.boost[label]) score *= ctx.boost[label];
    if (ctx.suppress && ctx.suppress[label]) score *= ctx.suppress[label];
    score = Math.round(Math.min(100, Math.max(0, score * jitter)));
    return {label, color, pct: score};
  }).sort((a, b) => b.pct - a.pct);
}

const ARCHETYPES = {
  pds_tornado: { sfcT: 28, sfcTd: 22, lapse: 6.8, dewDep: 0.3, inv: false, cap: 0 },
  classic_tornado: { sfcT: 26, sfcTd: 20, lapse: 6.5, dewDep: 0.35, inv: false, cap: 0 },
  high_shear_tornado: { sfcT: 24, sfcTd: 18, lapse: 6.2, dewDep: 0.4, inv: false, cap: 0 },
  cold_season: { sfcT: 16, sfcTd: 14, lapse: 5.8, dewDep: 0.2, inv: true, cap: 800 },
  hail_monster: { sfcT: 30, sfcTd: 14, lapse: 7.8, dewDep: 0.6, inv: false, cap: 0 },
  derecho: { sfcT: 32, sfcTd: 20, lapse: 6.0, dewDep: 0.5, inv: false, cap: 0 },
  flood: { sfcT: 24, sfcTd: 22, lapse: 5.5, dewDep: 0.15, inv: false, cap: 0 },
  squall_line: { sfcT: 28, sfcTd: 21, lapse: 6.0, dewDep: 0.3, inv: false, cap: 0 },
  tropical: { sfcT: 27, sfcTd: 24, lapse: 5.2, dewDep: 0.1, inv: false, cap: 0 },
  elevated: { sfcT: 12, sfcTd: 8, lapse: 6.5, dewDep: 0.5, inv: true, cap: 1500 },
  high_based: { sfcT: 32, sfcTd: 10, lapse: 7.5, dewDep: 0.8, inv: false, cap: 0 },
  haboob: { sfcT: 38, sfcTd: 8, lapse: 7.0, dewDep: 1.0, inv: false, cap: 0 },
  microburst: { sfcT: 36, sfcTd: 12, lapse: 7.2, dewDep: 0.7, inv: false, cap: 0 },
};

function generateProfile(archetype, indices, seed) {
  const arch = ARCHETYPES[archetype] || ARCHETYPES.classic_tornado;
  const levels = [];
  let rng = seed;
  const rnd = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
  for (let a = 0; a <= 12000; a += 300) {
    let t = arch.sfcT - arch.lapse * a / 1000;
    let td = arch.sfcTd - arch.dewDep * a / 1000;
    if (arch.inv && a < arch.cap) { t += 2 * (1 - a / arch.cap); }
    if (archetype === 'elevated' && a > 1000 && a < 3000) { td += 4; t += 2; }
    if (archetype === 'derecho' && a > 2000 && a < 6000) { td -= 8; }
    if (archetype === 'flood' && a < 3000) { td += 2; }
    t += (rnd() - 0.5) * 1.5;
    td += (rnd() - 0.5) * 1.0;
    td = Math.min(td, t - 0.5);
    const u = 5 + indices.shear6km * (a / 6000) * 0.3 + (rnd() - 0.5) * 3;
    const v = 2 + indices.srh3km * 0.01 * (a / 3000) + (rnd() - 0.5) * 2;
    levels.push({ a, t: Math.round(t * 10) / 10, d: Math.round(td * 10) / 10, u: Math.round(u * 10) / 10, v: Math.round(v * 10) / 10 });
  }
  return levels;
}

const RISK_COLORS = { High: '#FF00FF', Moderate: '#FF4400', Enhanced: '#FF8800', Slight: '#FFFF00', Marginal: '#00FF88', None: '#444444' };

function buildAnalog(line, idx) {
  const [name, location, date, archetype, muCape, stp, srh3, shear6, dcape, pwat, hailIn, risk] = line.split('|');
  const indices = {
    sbCape: Math.round(+muCape * 0.85),
    muCape: +muCape,
    mlCape: Math.round(+muCape * 0.75),
    cape3km: Math.round(+muCape * 0.6),
    sbCinh: -80,
    dcape: +dcape,
    stp: +stp,
    ship: +(stp * 1.2).toFixed(1),
    scp: +(stp * 0.9).toFixed(1),
    ehi: +((+muCape / 1000) * (+srh3 / 100) * 0.5).toFixed(1),
    srh3km: +srh3,
    shear1km: Math.round(+shear6 * 0.35),
    shear3km: Math.round(+shear6 * 0.55),
    shear6km: +shear6,
    pwat_mm: +pwat,
    estHailIn: +hailIn,
    tornadoPct: Math.min(48, Math.round(+stp * 5)),
    liftedIndex: -4,
    vtp: +(stp * 0.85).toFixed(1),
  };
  const hazards = computeHazards(indices, archetype, idx);
  const domHazard = hazards[0];
  const stormTypes = [];
  if (indices.stp >= 3) stormTypes.push({ label: 'Tornadic Supercell', shortLabel: 'TOR', score: Math.min(95, Math.round(indices.stp * 10)), color: '#FF0066' });
  if (indices.muCape >= 2000) stormTypes.push({ label: 'Classic Supercell', shortLabel: 'CLS', score: Math.min(90, Math.round(indices.muCape / 50)), color: '#FF4400' });
  if (indices.estHailIn >= 2) stormTypes.push({ label: 'Hail Producer', shortLabel: 'HAIL', score: Math.min(88, Math.round(indices.estHailIn * 30)), color: '#FF8800' });
  if (indices.dcape >= 1500) stormTypes.push({ label: 'Downburst/Derecho', shortLabel: 'WIND', score: Math.min(85, Math.round(indices.dcape / 25)), color: '#FF4400' });
  if (!stormTypes.length) stormTypes.push({ label: 'Pulse Storm', shortLabel: 'PLS', score: 25, color: '#AAAAAA' });
  return {
    id: 'builtin_' + idx,
    builtin: true,
    name,
    createdAt: new Date(date).getTime() || Date.now(),
    columnLabel: location,
    simTimeLabel: date,
    obsTimeLabel: 'Historical analog',
    hazards,
    indices,
    stormTypes,
    convMode: domHazard && domHazard.pct >= 30 ? domHazard.label : 'Thunderstorm',
    risk: { label: risk, color: RISK_COLORS[risk] || '#888888' },
    profile: generateProfile(archetype, indices, idx * 7919 + 1),
    notes: 'Built-in historical severe weather sounding analog.',
  };
}

const analogs = EVENT_LINES.map((line, i) => buildAnalog(line, i));

const out = `/* Auto-generated by scripts/generateAnalogPresets.js — do not edit manually */
(function(global) {
  global.SOUNDING_ANALOG_PRESETS = ${JSON.stringify(analogs)};
  global.SOUNDING_ANALOG_PRESETS_VERSION = 2;
})(typeof window !== 'undefined' ? window : global);
`;

const outPath = path.join(__dirname, '..', 'soundingAnalogPresets.js');
fs.writeFileSync(outPath, out, 'utf8');
console.log('Wrote', analogs.length, 'analogs to', outPath);
